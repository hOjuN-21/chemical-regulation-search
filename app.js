/* ==========================================================
   화학물질 법령규제 검색기 - 100% 서버리스 클라이언트 스크립트 app.js
   ========================================================== */

// PDF.js 워커 세팅 (CDN 주소와 버전을 일치시킵니다)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// ==========================================
// 1. 화학물질 규제 로컬 데이터 사전 (클라이언트 직접 내장)
// ==========================================
const MOCK_CHEMICALS = {
    "64-17-5": {
        "cas_no": "64-17-5",
        "name_ko": "에탄올",
        "name_en": "Ethanol",
        "formula": "C2H6O",
        "molecular_weight": "46.07",
        "regulations": {
            "san_an": {"status": "경고", "desc": "산업안전보건법: 노출기준설정물질, 인화성 액체 (관리대상 유해물질 아님)"},
            "hwa_gwan": {"status": "안전", "desc": "화학물질관리법: 규제 대상 유독물질 아님"},
            "danger": {"status": "경고", "desc": "위험물안전관리법: 제4류 알코올류 (지정수량 400L, 위험등급 II)"},
            "high_gas": {"status": "안전", "desc": "고압가스안전관리법: 해당 없음"},
            "imdg": {"status": "경고", "desc": "IMDG (해상운송): UN 1170, Class 3 (인화성 액체), PG II"},
            "iata": {"status": "경고", "desc": "IATA (항공운송): UN 1170, Class 3, PG II"}
        }
    },
    "71-43-2": {
        "cas_no": "71-43-2",
        "name_ko": "벤젠",
        "name_en": "Benzene",
        "formula": "C6H6",
        "molecular_weight": "78.11",
        "regulations": {
            "san_an": {"status": "위험", "desc": "산업안전보건법: 특별관리물질, 노출기준설정물질, 관리대상유해물질, 허가대상물질"},
            "hwa_gwan": {"status": "위험", "desc": "화학물질관리법: 유독물질, 사고대비물질, 제한물질 (함량 0.1% 초과 시)"},
            "danger": {"status": "경고", "desc": "위험물안전관리법: 제4류 제1석유류 (비수용성, 지정수량 200L, 위험등급 II)"},
            "high_gas": {"status": "안전", "desc": "고압가스안전관리법: 해당 없음"},
            "imdg": {"status": "위험", "desc": "IMDG (해상운송): UN 1114, Class 3 (인화성 및 발암성), PG II"},
            "iata": {"status": "위험", "desc": "IATA (항공운송): UN 1114, Class 3, PG II"}
        }
    },
    "7727-37-9": {
        "cas_no": "7727-37-9",
        "name_ko": "질소",
        "name_en": "Nitrogen",
        "formula": "N2",
        "molecular_weight": "28.01",
        "regulations": {
            "san_an": {"status": "주의", "desc": "산업안전보건법: 밀폐공간 산소결핍 질식 위험 유의"},
            "hwa_gwan": {"status": "안전", "desc": "화학물질관리법: 규제 대상 유독물질 아님"},
            "danger": {"status": "안전", "desc": "위험물안전관리법: 해당 없음"},
            "high_gas": {"status": "경고", "desc": "고압가스안전관리법: 불활성 압축가스 (용기 및 저장 설비 규제)"},
            "imdg": {"status": "주의", "desc": "IMDG (해상운송): UN 1066, Class 2.2 (비인화성, 비독성 가스)"},
            "iata": {"status": "주의", "desc": "IATA (항공운송): UN 1066, Class 2.2"}
        }
    },
    "7732-18-5": {
        "cas_no": "7732-18-5",
        "name_ko": "물 (정제수)",
        "name_en": "Water",
        "formula": "H2O",
        "molecular_weight": "18.02",
        "regulations": {
            "san_an": {"status": "안전", "desc": "산업안전보건법: 해당 사항 없음"},
            "hwa_gwan": {"status": "안전", "desc": "화학물질관리법: 해당 사항 없음"},
            "danger": {"status": "안전", "desc": "위험물안전관리법: 해당 사항 없음"},
            "high_gas": {"status": "안전", "desc": "고압가스안전관리법: 해당 사항 없음"},
            "imdg": {"status": "안전", "desc": "IMDG (해상운송): 비위험물"},
            "iata": {"status": "안전", "desc": "IATA (항공운송): 비위험물"}
        }
    }
};

function getLocalChemical(query) {
    query = query.trim().toLowerCase();
    for (const cas in MOCK_CHEMICALS) {
        if (cas === query) return MOCK_CHEMICALS[cas];
    }
    for (const cas in MOCK_CHEMICALS) {
        const data = MOCK_CHEMICALS[cas];
        if (query === data.name_ko.toLowerCase() || query === data.name_en.toLowerCase()) {
            return data;
        }
    }
    return null;
}

// ==========================================
// 2. DOM 초기화 및 이벤트 등록
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // UI 포인터
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loader-text');
    const resultSection = document.getElementById('result-section');
    const priorityBanner = document.getElementById('priority-banner');
    const bannerTitle = document.getElementById('banner-title');
    const bannerDesc = document.getElementById('banner-desc');
    
    // 설정 모달 포인터
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const saveSettings = document.getElementById('save-settings');
    const clearSettings = document.getElementById('clear-settings');
    const inputNvidiaKey = document.getElementById('input-nvidia-key');
    const inputDatagoKey = document.getElementById('input-datago-key');

    // 결과 렌더링 영역
    const resCas = document.getElementById('res-cas');
    const resNameKo = document.getElementById('res-name-ko');
    const resNameEn = document.getElementById('res-name-en');
    const resFormula = document.getElementById('res-formula');
    const resWeight = document.getElementById('res-weight');

    const cards = {
        san_an: document.getElementById('card-san-an'),
        hwa_gwan: document.getElementById('card-hwa-gwan'),
        danger: document.getElementById('card-danger'),
        high_gas: document.getElementById('card-high-gas'),
        imdg: document.getElementById('card-imdg'),
        iata: document.getElementById('card-iata')
    };

    const rawSection = document.getElementById('raw-section-container');
    const rawSec2 = document.getElementById('raw-sec-2');
    const rawSec15 = document.getElementById('raw-sec-15');

    // 모달창 토글 이벤트
    settingsBtn.addEventListener('click', () => {
        inputNvidiaKey.value = localStorage.getItem('NVIDIA_API_KEY') || '';
        inputDatagoKey.value = localStorage.getItem('DATA_GO_KEY') || '';
        settingsModal.classList.remove('hidden');
    });

    closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
    
    saveSettings.addEventListener('click', () => {
        localStorage.setItem('NVIDIA_API_KEY', inputNvidiaKey.value.trim());
        localStorage.setItem('DATA_GO_KEY', inputDatagoKey.value.trim());
        alert('API 연동 키가 브라우저에 안전하게 저장되었습니다.');
        settingsModal.classList.add('hidden');
    });

    clearSettings.addEventListener('click', () => {
        if (confirm('저장된 모든 API 키 설정을 삭제하고 초기화할까요?')) {
            localStorage.removeItem('NVIDIA_API_KEY');
            localStorage.removeItem('DATA_GO_KEY');
            inputNvidiaKey.value = '';
            inputDatagoKey.value = '';
            alert('초기화 완료되었습니다.');
        }
    });

    // 텍스트 검색 실행
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // 파일 드롭 & 드롭존 핸들링
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handlePdfFile(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handlePdfFile(e.dataTransfer.files[0]);
    });

    // ==========================================
    // 3. 브라우저단 100% 로컬 및 AI 통합 검색
    // ==========================================
    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query) {
            alert('검색어를 입력해 주세요.');
            return;
        }

        showLoader(true, '화학물질 데이터베이스를 대조하는 중입니다...');
        hideResults();

        // 1) 로컬 내장 Mock 사전 검색
        const localMatch = getLocalChemical(query);
        if (localMatch) {
            setTimeout(() => {
                renderResults(localMatch);
                showLoader(false);
            }, 300);
            return;
        }

        // 2) NVIDIA Nemotron AI를 통한 실시간 물질명 검색 (API 키가 등록되어 있는 경우)
        const nvidiaKey = localStorage.getItem('NVIDIA_API_KEY');
        if (nvidiaKey) {
            showLoader(true, `NVIDIA Nemotron 초거대 AI로 '${query}'의 법적 규제를 정밀 탐색 중입니다...`);
            const aiResult = await callNvidiaNemotronForName(nvidiaKey, query);
            showLoader(false);
            if (aiResult) {
                renderResults(aiResult);
                return;
            }
        }

        // 3) API 키가 없을 때의 동적 룰 진단 폴백
        const casPattern = /^\d{2,7}-\d{2}-\d$/;
        let responseData = {
            "cas_no": casPattern.test(query) ? query : "미확인",
            "name_ko": query,
            "name_en": "Unknown Substance",
            "formula": "확인 불가",
            "molecular_weight": "확인 불가",
            "regulations": runClientSideKeywordsParser(query) // 키워드 기반 정적 진단
        };

        // 경고 배너 유도
        responseData.msds_priority = false; // MSDS 업로드가 아닌 텍스트 검색임
        
        setTimeout(() => {
            renderResults(responseData);
            showLoader(false);
            
            // API 키 입력 유도를 위한 안내 배너 강제 노출
            priorityBanner.classList.remove('hidden');
            bannerTitle.textContent = "AI 실시간 정밀진단 비활성화 상태";
            bannerDesc.textContent = "우측 상단의 톱니바퀴 버튼을 눌러 NVIDIA API 키를 등록하시면, 이 물질의 실제 국내법 및 국제운송법 저촉 여부를 Nemotron 초거대 AI가 실시간으로 판정해 드립니다.";
        }, 300);
    }

    // ==========================================
    // 4. 브라우저 메모리상 PDF 분석 및 LLM 연동
    // ==========================================
    async function handlePdfFile(file) {
        if (file.type !== 'application/pdf') {
            alert('PDF 형식의 MSDS 문서만 지원합니다.');
            return;
        }

        showLoader(true, '웹 브라우저 내부에서 PDF 텍스트를 추출하는 중입니다...');
        hideResults();

        try {
            const fileReader = new FileReader();
            fileReader.onload = async function() {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = '';
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }

                await parseAndAnalyzeMsds(fullText);
            };
            fileReader.readAsArrayBuffer(file);
        } catch (error) {
            alert(`PDF 파싱 중 에러 발생: ${error.message}`);
            showLoader(false);
        }
    }

    // 추출된 MSDS 텍스트 분석 실행
    async function parseAndAnalyzeMsds(text) {
        showLoader(true, 'MSDS 텍스트 구조 분석 및 규제 항목을 식별 중입니다...');

        // 1) CAS 번호 정규식 탐지
        const casPattern = /\b\d{2,7}-\d{2}-\d\b/g;
        const matches = text.match(casPattern) || [];
        const uniqueCas = [...new Set(matches)];
        let detectedCas = null;
        if (uniqueCas.length > 0) {
            const valid = uniqueCas.filter(c => c !== "7732-18-5");
            detectedCas = valid.length > 0 ? valid[0] : uniqueCas[0];
        }

        // 2) 물질명 추출 시도
        let detectedName = null;
        const nameMatch = text.match(/가\.\s*제품명\s*:\s*([^\n]+)/) || text.match(/가\.\s*제품명\s*([^\n]+)/);
        if (nameMatch) {
            detectedName = nameMatch[1].trim();
        }

        // 3) 섹션 2 및 15조 영역 텍스트 추출
        let sec2Text = '';
        const sec2Start = text.indexOf('2. 유해성');
        if (sec2Start !== -1) {
            sec2Text = text.substring(sec2Start, sec2Start + 1200);
        }

        let sec15Text = '';
        const sec15Start = text.indexOf('15. 법적');
        if (sec15Start !== -1) {
            sec15Text = text.substring(sec15Start, sec15Start + 1500);
        } else {
            // 다른 양식 대응
            const sec15StartAlt = text.indexOf('15. 법적규제');
            if (sec15StartAlt !== -1) {
                sec15Text = text.substring(sec15StartAlt, sec15StartAlt + 1500);
            }
        }

        // 4) NVIDIA Nemotron LLM 진단 수행 (키 유무 확인)
        const nvidiaKey = localStorage.getItem('NVIDIA_API_KEY');
        let parsedRegulations = null;

        if (nvidiaKey) {
            showLoader(true, 'NVIDIA Nemotron 초거대 AI 모델로 규제 조항을 정밀 진단 중입니다...');
            parsedRegulations = await callNvidiaNemotronAPI(nvidiaKey, sec2Text, sec15Text);
        }

        // 5) LLM 응답 실패 시 브라우저단 로컬 규칙 엔진 폴백
        if (!parsedRegulations) {
            console.log('[시스템] 로컬 브라우저 규칙 파서가 가동됩니다.');
            parsedRegulations = runClientSideRuleParser(sec15Text, text);
        }

        // 6) 최종 결과 데이터 조립
        let finalData = {};
        const localMatch = detectedCas ? getLocalChemical(detectedCas) : (detectedName ? getLocalChemical(detectedName) : null);

        if (localMatch) {
            finalData = JSON.parse(JSON.stringify(localMatch));
        } else {
            finalData = {
                "cas_no": detectedCas || "미지정",
                "name_ko": detectedName || "미확인 화학제품",
                "name_en": "Imported Mixture / Substance",
                "formula": "확인 불가",
                "molecular_weight": "확인 불가",
                "regulations": {}
            };
        }

        // MSDS 우선 원칙 강제 적용
        finalData.msds_priority = true;
        finalData.regulations = parsedRegulations;
        finalData.section_2_text = sec2Text.substring(0, 800);
        finalData.section_15_text = sec15Text.substring(0, 1000);

        showLoader(false);
        renderResults(finalData);
    }

    // ==========================================
    // 5. NVIDIA Nemotron API 직접 fetch 통신 (PDF)
    // ==========================================
    async function callNvidiaNemotronAPI(apiKey, sec2, sec15) {
        const url = "https://integrate.api.nvidia.com/v1/chat/completions";
        
        const systemPrompt = `당신은 대한민국 화학물질 규제 전문가입니다. 제공된 화학물질 MSDS의 유해성(2조) 및 법적규제현황(15조) 텍스트를 분석하여 요청하는 국내외 6가지 법적 규제에 저촉되는지 분류하고 근거를 요약하여 반환해야 합니다.
분류할 대상 법령 및 키워드:
1. san_an (산업안전보건법)
2. hwa_gwan (화학물질관리법)
3. danger (위험물안전관리법)
4. high_gas (고압가스안전관리법)
5. imdg (해상운송 IMDG)
6. iata (항공운송 IATA DGR)

반드시 아래의 엄격한 JSON 형식으로만 응답해야 합니다. 어떠한 Markdown 코드 블록도 포함하지 말고 오직 순수 JSON 데이터만 반환하십시오.
JSON 형식:
{
  "san_an": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "hwa_gwan": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "danger": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "high_gas": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "imdg": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "iata": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"}
}`;

        const userPrompt = `MSDS 제2조 유해성 위험성:\n${sec2}\n\nMSDS 제15조 법적 규제현황:\n${sec15}`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    "model": "nvidia/nemotron-3-ultra-550b-a55b",
                    "messages": [
                        {"role": "system", "content": systemPrompt},
                        {"role": "user", "content": userPrompt}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 1024
                })
            });

            if (!response.ok) throw new Error('API 응답 실패');

            const resData = await response.json();
            let content = resData.choices[0].message.content.trim();

            if (content.startsWith("```")) {
                content = content.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
            }

            return JSON.parse(content);
        } catch (error) {
            console.error("[NVIDIA LLM 통신 실패]", error);
            return null;
        }
    }

    // ==========================================
    // 5-2. NVIDIA Nemotron 직접 통신 (일반 물질명 검색)
    // ==========================================
    async function callNvidiaNemotronForName(apiKey, name) {
        const url = "https://integrate.api.nvidia.com/v1/chat/completions";
        
        const systemPrompt = `당신은 대한민국 화학물질 규제 전문가입니다. 입력받은 화학물질명에 대해 국내외 6가지 법적 규제에 저촉되는지 분류하고 근거와 규제치를 요약하여 반환해야 합니다.
분류할 대상 법령:
1. san_an (산업안전보건법)
2. hwa_gwan (화학물질관리법)
3. danger (위험물안전관리법)
4. high_gas (고압가스안전관리법)
5. imdg (해상운송 IMDG)
6. iata (항공운송 IATA DGR)

반드시 아래의 엄격한 JSON 형식으로만 응답해야 합니다. 어떠한 Markdown 코드 블록도 포함하지 말고 오직 순수 JSON 데이터만 반환하십시오.
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

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    "model": "nvidia/nemotron-3-ultra-550b-a55b",
                    "messages": [
                        {"role": "system", "content": systemPrompt},
                        {"role": "user", "content": `검색 물질명: ${name}`}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 1024
                })
            });

            if (!response.ok) throw new Error('API 응답 실패');

            const resData = await response.json();
            let content = resData.choices[0].message.content.trim();

            if (content.startsWith("```")) {
                content = content.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
            }

            const parsed = JSON.parse(content);
            parsed.msds_priority = false;
            return parsed;
        } catch (error) {
            console.error("[NVIDIA LLM 통신 실패]", error);
            return null;
        }
    }

    // ==========================================
    // 6. 브라우저단 로컬 키워드 매칭 규칙 엔진 (PDF)
    // ==========================================
    function runClientSideRuleParser(sec15Text, fullText) {
        const parsed = {};
        const lowerText = sec15Text.toLowerCase();

        // 1) 산업안전보건법
        const sanAnKeywords = ["노출기준", "관리대상", "특별관리물질", "금지물질", "허가대상"];
        const sanAnFound = sanAnKeywords.filter(k => lowerText.includes(k));
        if (lowerText.includes("금지물질") || lowerText.includes("허가대상")) {
            parsed["san_an"] = {"status": "위험", "desc": `MSDS 우선 기재(로컬): ${sanAnFound.join(', ')} 법적 의무 확인 요망`};
        } else if (sanAnFound.length > 0) {
            parsed["san_an"] = {"status": "경고", "desc": `MSDS 우선 기재(로컬): ${sanAnFound.join(', ')} 대상에 해당함`};
        } else {
            parsed["san_an"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 특이 규제 내역 감지되지 않음"};
        }

        // 2) 화학물질관리법
        const hwaGwanKeywords = ["유독물질", "사고대비물질", "제한물질", "금지물질"];
        const hwaGwanFound = hwaGwanKeywords.filter(k => lowerText.includes(k));
        if (lowerText.includes("사고대비물질") || lowerText.includes("금지물질")) {
            parsed["hwa_gwan"] = {"status": "위험", "desc": `MSDS 우선 기재(로컬): 화관법 상의 ${hwaGwanFound.join(', ')} 고지`};
        } else if (hwaGwanFound.length > 0) {
            parsed["hwa_gwan"] = {"status": "경고", "desc": `MSDS 우선 기재(로컬): 화관법 상의 ${hwaGwanFound.join(', ')} 해당`};
        } else {
            parsed["hwa_gwan"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 특이 규제 내역 감지되지 않음"};
        }

        // 3) 위험물안전관리법
        const dangerMatch = sec15Text.match(/(제\s*\d\s*류\s*[^,\.\n]+|지정수량\s*\d+[^,\.\n]*)/);
        if (dangerMatch) {
            parsed["danger"] = {"status": "경고", "desc": `MSDS 우선 기재(로컬): 위험물안전법상 ${dangerMatch[1].trim()}`};
        } else {
            parsed["danger"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 특이 규제 내역 감지되지 않음"};
        }

        // 4) 고압가스안전관리법
        if (lowerText.includes("고압가스")) {
            parsed["high_gas"] = {"status": "경고", "desc": "MSDS 우선 기재(로컬): 고압가스안전관리법 실린더 용기 적용 대상"};
        } else {
            parsed["high_gas"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 해당 없음"};
        }

        // 5) 국제 운송 (IMDG/IATA)
        const unMatch = (sec15Text + " " + fullText).match(/UN\s*(\d{4})/i);
        if (unMatch) {
            parsed["imdg"] = {"status": "경고", "desc": `MSDS 우선 기재(로컬): 해상운송 UN ${unMatch[1]} 위험 제한`};
            parsed["iata"] = {"status": "경고", "desc": `MSDS 우선 기재(로컬): 항공운송 UN ${unMatch[1]} 수하물 제한`};
        } else {
            parsed["imdg"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 일반 등급 (제한 없음)"};
            parsed["iata"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 일반 등급 (제한 없음)"};
        }

        return parsed;
    }

    // ==========================================
    // 6-2. 텍스트 검색 입력어에 대한 단순 규칙 판단
    // ==========================================
    function runClientSideKeywordsParser(name) {
        const parsed = {};
        const lowerName = name.toLowerCase();

        // 1) 산업안전보건법
        if (lowerName.includes("황산") || lowerName.includes("염산") || lowerName.includes("질산")) {
            parsed["san_an"] = {"status": "경고", "desc": "산업안전보건법: 노출기준설정물질 및 관리대상유해물질 해당 (환기 및 보호구 착용 필수)"};
        } else {
            parsed["san_an"] = {"status": "주의", "desc": "산업안전보건법: 상세 유해성 분류를 위해 MSDS 검토 요망"};
        }

        // 2) 화학물질관리법
        if (lowerName.includes("황산") || lowerName.includes("염산") || lowerName.includes("질산")) {
            parsed["hwa_gwan"] = {"status": "위험", "desc": "화학물질관리법: 사고대비물질 및 유독물질 해당 (취급기준 및 영업허가 요건 검토)"};
        } else {
            parsed["hwa_gwan"] = {"status": "주의", "desc": "화학물질관리법: 화관법 유해화학물질 지정 성분 검출 여부 확인 요망"};
        }

        // 3) 위험물안전관리법
        if (lowerName.includes("황산") || lowerName.includes("염산") || lowerName.includes("질산")) {
            parsed["danger"] = {"status": "안전", "desc": "위험물안전관리법: 무기산류는 소방법상 위험물에 해당하지 않음 (다만 강한 부식성 유의)"};
        } else {
            parsed["danger"] = {"status": "주의", "desc": "위험물안전관리법: 인화성/인화성 액체 등 유별 기준 대조 요망"};
        }

        // 4) 고압가스
        if (lowerName.includes("가스") || lowerName.includes("액체질소") || lowerName.includes("산소")) {
            parsed["high_gas"] = {"status": "경고", "desc": "고압가스안전관리법: 고압가스 용기 보관 및 충전설비 관련 기준 검토 필요"};
        } else {
            parsed["high_gas"] = {"status": "안전", "desc": "고압가스안전관리법: 고압가스 물질 아님"};
        }

        // 5) 국제 운송
        if (lowerName.includes("황산")) {
            parsed["imdg"] = {"status": "위험", "desc": "IMDG (해상운송): UN 2796 (또는 1830), Class 8 (부식성 물질), PG II"};
            parsed["iata"] = {"status": "위험", "desc": "IATA (항공운송): UN 2796 (또는 1830), Class 8, PG II (항공기 탑재 제한)"};
        } else {
            parsed["imdg"] = {"status": "주의", "desc": "IMDG (해상운송): 위험물 운송 선언 대상 가능성 점검"};
            parsed["iata"] = {"status": "주의", "desc": "IATA (항공운송): 위탁/휴대수하물 제한여부 점검"};
        }

        return parsed;
    }

    // ==========================================
    // 7. 결과 렌더링 및 UI 제어 유틸리티
    // ==========================================
    function renderResults(data) {
        resCas.textContent = `CAS ${data.cas_no || '미지정'}`;
        resNameKo.textContent = data.name_ko;
        resNameEn.textContent = data.name_en || 'Unknown Substance';
        resFormula.textContent = data.formula || '-';
        resWeight.textContent = data.molecular_weight || '-';

        // 배너 토글
        if (data.msds_priority) {
            priorityBanner.classList.remove('hidden');
            bannerTitle.textContent = "MSDS 규제정보 우선 적용 판정";
            bannerDesc.textContent = "단일 CAS 번호 조회보다 실제 제품 MSDS(제15조 법적 규제현황)에 수록된 고지 의무 및 제한기준을 최우선으로 반영하여 도출한 리포트입니다.";
        } else {
            priorityBanner.classList.add('hidden');
        }

        // 규제 카드 채우기
        for (const key in cards) {
            const card = cards[key];
            const info = data.regulations[key] || { status: '안전', desc: '특이 규제 내역이 매핑되지 않았습니다.' };
            
            const badge = card.querySelector('.status-badge');
            const desc = card.querySelector('.card-desc');

            badge.textContent = info.status;
            badge.className = 'status-badge'; // reset
            
            if (info.status === '안전') badge.classList.add('status-safe');
            else if (info.status === '주의') badge.classList.add('status-info');
            else if (info.status === '경고') badge.classList.add('status-warning');
            else if (info.status === '위험') badge.classList.add('status-danger');

            desc.textContent = info.desc;
        }

        // 원본 텍스트 매치
        if (data.msds_priority && (data.section_2_text || data.section_15_text)) {
            rawSection.classList.remove('hidden');
            rawSec2.textContent = data.section_2_text || '추출 데이터 없음';
            rawSec15.textContent = data.section_15_text || '추출 데이터 없음';
        } else {
            rawSection.classList.add('hidden');
        }

        resultSection.classList.remove('hidden');
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function showLoader(show, text = '') {
        if (show) {
            loader.classList.remove('hidden');
            loaderText.textContent = text;
        } else {
            loader.classList.add('hidden');
        }
    }

    function hideResults() {
        resultSection.classList.add('hidden');
        rawSection.classList.add('hidden');
    }
});
