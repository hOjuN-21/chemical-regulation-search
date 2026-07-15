/**
 * CHEM-REG Cloudflare Worker Proxy
 * 
 * 이 스크립트는 Cloudflare Worker 환경에서 실행됩니다.
 * 프론트엔드로부터 물질 정보 또는 MSDS 텍스트를 받아,
 * 내부 환경 변수로 지정된 NVIDIA_API_KEY를 이용해 NVIDIA Nemotron-3 AI를 호출합니다.
 */

// CORS 공통 응답 헤더 생성 함수
function getCorsHeaders(request) {
    const origin = request.headers.get("Origin") || "*";
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
    };
}

// 에러 응답 유틸리티
function jsonError(message, status = 400, headers = {}) {
    return new Response(JSON.stringify({ error: message }), {
        status: status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...headers
        }
    });
}

function normalizeInput(value) {
    return typeof value === "string" ? value.trim() : "";
}

function buildRegulationFallback() {
    return {
        san_an: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. MSDS 원문 제15조를 직접 확인해 주세요." },
        hwa_gwan: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. 화학물질관리법 대상 여부를 별도 확인해 주세요." },
        danger: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. 위험물안전관리법 유별 및 지정수량을 별도 확인해 주세요." },
        high_gas: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. 고압가스 해당 여부를 별도 확인해 주세요." },
        imdg: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. UN 번호 및 IMDG 등급을 별도 확인해 주세요." },
        iata: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. UN 번호 및 IATA DGR 등급을 별도 확인해 주세요." }
    };
}

function normalizeRegulations(value) {
    const fallback = buildRegulationFallback();
    const source = value && typeof value === "object" ? value : {};

    for (const key of Object.keys(fallback)) {
        const item = source[key];
        if (item && typeof item === "object") {
            fallback[key] = {
                status: typeof item.status === "string" ? item.status : "주의",
                desc: typeof item.desc === "string" ? item.desc : fallback[key].desc
            };
        }
    }

    return fallback;
}

function extractJsonObject(content) {
    const firstBrace = content.indexOf("{");
    if (firstBrace === -1) return null;

    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let i = firstBrace; i < content.length; i++) {
        const char = content[i];

        if (isEscaped) {
            isEscaped = false;
            continue;
        }

        if (char === "\\") {
            isEscaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (char === "{") depth++;
        if (char === "}") depth--;

        if (depth === 0) {
            return content.slice(firstBrace, i + 1);
        }
    }

    return content.slice(firstBrace);
}

// 메인 요청 핸들러
export default {
    async fetch(request, env, ctx) {
        const corsHeaders = getCorsHeaders(request);

        // Preflight OPTIONS 요청 대응
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });
        }

        // POST 요청만 허용
        if (request.method !== "POST") {
            return jsonError("Method Not Allowed (Only POST is allowed)", 405, corsHeaders);
        }

        // Cloudflare Worker에 설정된 NVIDIA_API_KEY 체크
        const apiKey = env.NVIDIA_API_KEY ? env.NVIDIA_API_KEY.trim() : null;
        if (!apiKey) {
            return jsonError("Server Configuration Error: NVIDIA_API_KEY is missing on Worker", 500, corsHeaders);
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            const body = await request.json();

            // 1. MSDS PDF 분석 엔드포인트
            if (path === "/api/diagnose-pdf") {
                const sec2 = normalizeInput(body.sec2);
                const sec15 = normalizeInput(body.sec15);
                if (!sec2 && !sec15) {
                    return jsonError("Missing MSDS text: sec2 or sec15 is required", 400, corsHeaders);
                }
                const safeSec2 = sec2 || "MSDS 제2조 텍스트를 별도로 추출하지 못했습니다. 제공된 제15조 또는 발췌 원문을 기준으로 판단하세요.";
                const safeSec15 = sec15 || "MSDS 제15조 텍스트를 별도로 추출하지 못했습니다. 제공된 제2조 또는 발췌 원문을 기준으로 판단하세요.";

                const systemPrompt = `You are a strict JSON data generator. 당신은 대한민국 화학물질 규제 전문가입니다. 제공된 화학물질 MSDS의 유해성(2조) 및 법적규제현황(15조) 텍스트를 분석하여 요청하는 국내외 6가지 법적 규제에 저촉되는지 분류하고 근거를 요약하여 반환해야 합니다.
분류할 대상 법령 및 키워드:
1. san_an (산업안전보건법)
2. hwa_gwan (화학물질관리법)
3. danger (위험물안전관리법)
4. high_gas (고압가스안전관리법)
5. imdg (해상운송 IMDG)
6. iata (항공운송 IATA DGR)

CRITICAL INSTRUCTION: You MUST output ONLY valid JSON. No explanations, no thoughts, no markdown formatting. 절대로 당신의 생각 과정(Chain of Thought)이나 설명을 포함하지 마십시오. 첫 글자는 반드시 '{' 이어야 하며, 마지막 글자는 반드시 '}' 이어야 합니다. 어떠한 Markdown 코드 블록(\`\`\`)도 사용하지 마십시오. 오직 순수 JSON 데이터만 반환하십시오.
JSON 형식:
{
  "san_an": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "hwa_gwan": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "danger": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "high_gas": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "imdg": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "iata": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"}
}`;
                const userPrompt = `MSDS 제2조 유해성 위험성:\n${safeSec2}\n\nMSDS 제15조 법적 규제현황:\n${safeSec15}\n\nCRITICAL: Output ONLY a JSON object. No other text.`;
                
                const aiResponse = await callNvidiaNemotron(apiKey, systemPrompt, userPrompt);
                return new Response(JSON.stringify(normalizeRegulations(aiResponse)), {
                    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
                });
            }

            // 2. 물질명 검색 엔드포인트
            else if (path === "/api/diagnose-name") {
                const name = normalizeInput(body.name);
                if (!name) {
                    return jsonError("Missing required parameter: name", 400, corsHeaders);
                }

                const systemPrompt = `You are a strict JSON data generator. 당신은 대한민국 화학물질 규제 전문가입니다. 입력받은 화학물질명에 대해 국내외 6가지 법적 규제에 저촉되는지 분류하고 근거와 규제치를 요약하여 반환해야 합니다.
분류할 대상 법령:
1. san_an (산업안전보건법)
2. hwa_gwan (화학물질관리법)
3. danger (위험물안전관리법)
4. high_gas (고압가스안전관리법)
5. imdg (해상운송 IMDG)
6. iata (항공운송 IATA DGR)

CRITICAL INSTRUCTION: You MUST output ONLY valid JSON. No explanations, no thoughts, no markdown formatting. 절대로 당신의 생각 과정(Chain of Thought)이나 설명을 포함하지 마십시오. 첫 글자는 반드시 '{' 이어야 하며, 마지막 글자는 반드시 '}' 이어야 합니다. 어떠한 Markdown 코드 블록(\`\`\`)도 사용하지 마십시오. 오직 순수 JSON 데이터만 반환하십시오.
JSON 형식:
{
  "cas_no": "물질의 CAS 번호 (확인 불가 시 미확인)",
  "name_ko": "한글 물질명",
  "name_en": "영문 물질명",
  "formula": "분자식 (확인 불가 시 -)",
  "molecular_weight": "분자량 (확인 불가 시 -)",
  "regulations": {
    "san_an": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
    "hwa_gwan": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
    "danger": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
    "high_gas": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
    "imdg": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
    "iata": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"}
  }
}`;
                const userPrompt = `화학물질명: ${name}\n\nCRITICAL: Output ONLY a JSON object. No other text.`;

                const aiResponse = await callNvidiaNemotron(apiKey, systemPrompt, userPrompt);
                return new Response(JSON.stringify(aiResponse), {
                    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
                });
            }

            // 잘못된 경로 요청
            else {
                return jsonError("Not Found (Endpoint must be /api/diagnose-pdf or /api/diagnose-name)", 404, corsHeaders);
            }

        } catch (err) {
            return jsonError("Internal Server Error: " + err.message, 500, corsHeaders);
        }
    }
};

// NVIDIA API 통신 함수
async function callNvidiaNemotron(apiKey, systemPrompt, userPrompt) {
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";
    
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            "model": "nvidia/nemotron-3-ultra-550b-a55b",
            "messages": [
                { "role": "system", "content": systemPrompt },
                { "role": "user", "content": userPrompt }
            ],
            "temperature": 0.1,
            "max_tokens": 1024
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`NVIDIA API responded with status ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const resData = await response.json();
    let content = resData?.choices?.[0]?.message?.content?.trim();
    if (!content) {
        throw new Error("NVIDIA API returned an empty message");
    }

    // 혹시 모를 Markdown 블록 제거
    if (content.startsWith("```")) {
        content = content.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
    }

    // JSON 부분만 추출 및 닫는 괄호 복구
    const extractedJson = extractJsonObject(content);
    if (extractedJson) {
        try {
            return JSON.parse(extractedJson);
        } catch (e) {
            try {
                return JSON.parse(extractedJson + "}");
            } catch (e2) {
                try {
                    return JSON.parse(extractedJson + "}}");
                } catch (e3) {
                    throw new Error("Invalid JSON inside braces: " + extractedJson);
                }
            }
        }
    }

    throw new Error("AI generated non-JSON response: " + content);
}
