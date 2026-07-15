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
    // 기본 보안 프록시 주소 (자동 배포 시 여기에 반영됩니다)
    const DEFAULT_PROXY_URL = "https://chem-reg-proxy.archim79.workers.dev";
    const PDF_PROXY_TIMEOUT_MS = 8000;

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
    const inputProxyUrl = document.getElementById('input-proxy-url');
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

    function showStatusBanner(title, message) {
        resultSection.classList.remove('hidden');
        rawSection.classList.add('hidden');
        priorityBanner.classList.remove('hidden');
        bannerTitle.textContent = title;
        bannerDesc.textContent = message;
    }

    // 모달창 토글 이벤트
    settingsBtn.addEventListener('click', () => {
        inputNvidiaKey.value = localStorage.getItem('NVIDIA_API_KEY') || '';
        inputProxyUrl.value = localStorage.getItem('PROXY_URL') || '';
        inputDatagoKey.value = localStorage.getItem('DATA_GO_KEY') || '';
        settingsModal.classList.remove('hidden');
    });

    closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
    
    saveSettings.addEventListener('click', () => {
        localStorage.setItem('NVIDIA_API_KEY', inputNvidiaKey.value.trim());
        localStorage.setItem('PROXY_URL', inputProxyUrl.value.trim());
        localStorage.setItem('DATA_GO_KEY', inputDatagoKey.value.trim());
        alert('API 연동 설정이 브라우저에 안전하게 저장되었습니다.');
        settingsModal.classList.add('hidden');
    });

    clearSettings.addEventListener('click', () => {
        if (confirm('저장된 모든 API 키 및 프록시 설정을 삭제하고 초기화할까요?')) {
            localStorage.removeItem('NVIDIA_API_KEY');
            localStorage.removeItem('PROXY_URL');
            localStorage.removeItem('DATA_GO_KEY');
            inputNvidiaKey.value = '';
            inputProxyUrl.value = '';
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

        // 2) NVIDIA API 키가 있다면 직접 AI 호출
        const nvidiaKey = localStorage.getItem('NVIDIA_API_KEY');
        if (nvidiaKey) {
            showLoader(true, `NVIDIA Nemotron 초거대 AI로 '${query}'의 법적 규제를 직접 정밀 탐색 중입니다...`);
            const aiResult = await callNvidiaNemotronForName(nvidiaKey, query);
            showLoader(false);
            if (aiResult) {
                renderResults(aiResult);
                return;
            }
        }

        // 3) API 키는 없지만 보안 프록시 주소(PROXY_URL)가 있다면 프록시를 통해 AI 호출
        const proxyUrl = localStorage.getItem('PROXY_URL') || DEFAULT_PROXY_URL;
        if (proxyUrl) {
            showLoader(true, `사내 보안 프록시 AI 서버로 '${query}'의 규제를 진단 요청 중입니다...`);
            const aiResult = await callProxyAPIForName(proxyUrl, query);
            showLoader(false);
            if (aiResult) {
                renderResults(aiResult);
                // 프록시 적용 배너
                priorityBanner.classList.remove('hidden');
                if (aiResult.ai_warning) {
                    bannerTitle.textContent = "AI 응답 확인 필요";
                    bannerDesc.textContent = aiResult.ai_warning;
                } else {
                    bannerTitle.textContent = "보안 프록시 AI 진단 완료";
                    bannerDesc.textContent = "사내 보안 프록시(Cloudflare Workers) 서버를 통하여 NVIDIA AI 정밀 분석을 안전하게 수행했습니다.";
                }
                return;
            }
        }

        // 4) API 키와 프록시 주소가 모두 없을 때의 동적 룰 진단 폴백
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
        responseData.msds_priority = false;
        
        setTimeout(() => {
            renderResults(responseData);
            showLoader(false);
            
            // API 키 또는 프록시 입력 유도를 위한 안내 배너 강제 노출
            priorityBanner.classList.remove('hidden');
            bannerTitle.textContent = "AI 실시간 정밀진단 비활성화 상태 (로컬 룰 판정)";
            bannerDesc.textContent = "우측 상단의 톱니바퀴 버튼을 클릭하여 'NVIDIA API 키' 또는 사내 '보안 프록시 URL'을 등록하시면, 이 물질의 법적 저촉 여부를 Nemotron 초거대 AI가 실시간으로 분석해 드립니다.";
        }, 300);
    }

    // ==========================================
    // 4. 브라우저 메모리상 PDF 분석 및 LLM 연동
    // ==========================================
    async function handlePdfFile(file) {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (!isPdf) {
            showLoader(false);
            hideResults();
            showStatusBanner("지원하지 않는 파일 형식", "PDF 형식의 MSDS 문서만 지원합니다.");
            return;
        }

        showLoader(true, '웹 브라우저 내부에서 PDF 텍스트를 추출하는 중입니다...');
        hideResults();

        let uploadFinished = false;
        try {
            const fileReader = new FileReader();
            fileReader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    let fullText = '';

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = extractPdfPageText(textContent.items);
                        fullText += pageText + '\n';
                    }

                    if (!fullText.trim()) {
                        throw new Error('PDF에서 텍스트를 추출하지 못했습니다. 스캔 이미지 PDF는 OCR 처리 후 다시 업로드해 주세요.');
                    }

                    await parseAndAnalyzeMsds(fullText);
                } catch (error) {
                    console.error("[PDF 파싱 실패]", error);
                    showLoader(false);
                    showStatusBanner("PDF 파싱 오류", `PDF 텍스트 추출에 실패했습니다. ${error.message}`);
                } finally {
                    uploadFinished = true;
                    showLoader(false);
                }
            };
            fileReader.onerror = function() {
                uploadFinished = true;
                showLoader(false);
                showStatusBanner("PDF 파일 읽기 오류", "PDF 파일을 읽는 중 오류가 발생했습니다. 파일을 다시 선택해 주세요.");
            };
            fileReader.readAsArrayBuffer(file);
        } catch (error) {
            uploadFinished = true;
            showLoader(false);
            showStatusBanner("PDF 파싱 오류", `PDF 처리 중 오류가 발생했습니다. ${error.message}`);
        }

        setTimeout(() => {
            if (!uploadFinished) {
                showLoader(false);
                showStatusBanner("분석 지연", "AI 서버 응답이 지연되어 로컬 룰 판정 결과를 우선 표시합니다. 잠시 후 다시 업로드해도 됩니다.");
            }
        }, PDF_PROXY_TIMEOUT_MS + 2000);
    }

    function extractPdfPageText(items) {
        let lastY = null;
        let pageText = '';

        for (const item of items) {
            const text = typeof item.str === 'string' ? item.str.trim() : '';
            if (!text) continue;

            const y = Array.isArray(item.transform) ? item.transform[5] : null;
            const isNewLine = lastY !== null && typeof y === 'number' && Math.abs(y - lastY) > 5;

            if (isNewLine) {
                pageText += '\n';
            } else if (pageText && !pageText.endsWith('\n') && !/[\s(/-]$/.test(pageText)) {
                pageText += ' ';
            }

            pageText += text;
            if (typeof y === 'number') lastY = y;
        }

        return pageText;
    }

    function normalizePdfText(text) {
        return text
            .replace(/\r/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .trim();
    }

    function extractMsdsSection(text, sectionNumber, titleKeywords, maxLength) {
        const normalized = normalizePdfText(text);
        const titlePattern = titleKeywords.map(toFlexibleKeywordPattern).join('|');
        const sectionNumPattern = `(?:제\\s*${sectionNumber}\\s*조|Section\\s*${sectionNumber}|${sectionNumber})`;
        const startRegex = new RegExp(`(?:^|\\n|\\s)${sectionNumPattern}\\s*[\\.\\):\\-]?\\s*(?:${titlePattern})`, 'i');
        const startMatch = normalized.match(startRegex);

        if (!startMatch || startMatch.index === undefined) {
            return '';
        }

        const start = startMatch.index;
        const nextSectionNumber = sectionNumber + 1;
        const nextSectionPattern = `(?:제\\s*${nextSectionNumber}\\s*조|Section\\s*${nextSectionNumber}|${nextSectionNumber})`;
        const nextSectionRegex = new RegExp(`(?:^|\\n|\\s)${nextSectionPattern}\\s*[\\.\\):\\-]?\\s*`, 'i');
        const remainder = normalized.slice(start + startMatch[0].length);
        const nextMatch = remainder.match(nextSectionRegex);
        const end = nextMatch && nextMatch.index !== undefined
            ? start + startMatch[0].length + nextMatch.index
            : start + maxLength;

        return normalized.slice(start, end).trim().slice(0, maxLength);
    }

    function toFlexibleKeywordPattern(keyword) {
        return keyword
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('\\s*');
    }

    function buildFallbackMsdsExcerpt(text, maxLength = 1800) {
        const normalized = normalizePdfText(text);
        const keywords = ['법적 규제', '법적규제', 'Regulatory Information', 'RegulatoryInformation', 'Regulatory Info', 'RegulatoryInfo', 'Regulation Info', 'RegulationInfo', '유해성', '위험성', 'Hazards Identification', 'HazardsIdentification', 'Hazard Info', 'HazardInfo', '산업안전', '화학물질관리', '위험물', '고압가스', 'UN'];
        const hitPositions = keywords
            .map(keyword => normalized.indexOf(keyword))
            .filter(index => index >= 0);
        const start = hitPositions.length > 0 ? Math.max(0, Math.min(...hitPositions) - 300) : 0;
        return normalized.slice(start, start + maxLength).trim();
    }

    // 추출된 MSDS 텍스트 분석 실행
    async function parseAndAnalyzeMsds(text) {
        showLoader(true, 'MSDS 텍스트 구조 분석 및 규제 항목을 식별 중입니다...');
        const normalizedText = normalizePdfText(text);

        // 1) CAS 번호 정규식 탐지
        const casPattern = /\b\d{2,7}-\d{2}-\d\b/g;
        const matches = normalizedText.match(casPattern) || [];
        const uniqueCas = [...new Set(matches)];
        let detectedCas = null;
        if (uniqueCas.length > 0) {
            const valid = uniqueCas.filter(c => c !== "7732-18-5");
            detectedCas = valid.length > 0 ? valid[0] : uniqueCas[0];
        }

        // 2) 물질명 추출 시도
        let detectedName = null;
        const nameMatch = normalizedText.match(/(?:가\.\s*)?(?:제품명|물질명|화학제품과 회사에 관한 정보)\s*:?\s*([^\n]+)/i);
        if (nameMatch) {
            detectedName = nameMatch[1].trim();
        }

        // 3) 섹션 2 및 15조 영역 텍스트 추출
        const fallbackExcerpt = buildFallbackMsdsExcerpt(normalizedText);
        let sec2Text = extractMsdsSection(normalizedText, 2, ['유해성', '위험성', '유해 위험성', 'Hazard identification', 'Hazards identification', 'HazardsIdentification', 'Hazard info', 'HazardInfo'], 1200);
        let sec15Text = extractMsdsSection(normalizedText, 15, ['법적', '법적규제', '법적 규제', '법적 규제현황', 'Regulatory information', 'RegulatoryInformation', 'Regulatory info', 'RegulatoryInfo', 'Regulation information', 'Regulation info'], 1600);

        if (!sec2Text) sec2Text = fallbackExcerpt;
        if (!sec15Text) sec15Text = fallbackExcerpt;

        // 4) NVIDIA Nemotron LLM 진단 수행 (키 유무 확인)
        const nvidiaKey = localStorage.getItem('NVIDIA_API_KEY');
        const proxyUrl = localStorage.getItem('PROXY_URL') || DEFAULT_PROXY_URL;
        let parsedRegulations = null;
        let isProxyUsed = false;
        let isLocalFallbackUsed = false;

        if (nvidiaKey) {
            showLoader(true, 'NVIDIA Nemotron 초거대 AI 모델로 규제 조항을 직접 정밀 진단 중입니다...');
            parsedRegulations = await callNvidiaNemotronAPI(nvidiaKey, sec2Text, sec15Text);
        }

        if (!parsedRegulations && proxyUrl) {
            showLoader(true, '사내 보안 프록시 AI 서버로 MSDS 규제 분석을 요청 중입니다...');
            parsedRegulations = await callProxyAPIForPdf(proxyUrl, sec2Text, sec15Text);
            if (parsedRegulations) isProxyUsed = true;
        }

        // 5) LLM 응답 실패 시 브라우저단 로컬 규칙 엔진 폴백
        if (!parsedRegulations) {
            console.log('[시스템] 로컬 브라우저 규칙 파서가 가동됩니다.');
            parsedRegulations = runClientSideRuleParser(sec15Text, normalizedText);
            isLocalFallbackUsed = true;
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

        if (isProxyUsed) {
            priorityBanner.classList.remove('hidden');
            bannerTitle.textContent = "보안 프록시 AI 진단 완료";
            bannerDesc.textContent = "사내 보안 프록시(Cloudflare Workers) 서버를 통해 업로드된 MSDS 본문을 정밀 진단하였습니다.";
        } else if (isLocalFallbackUsed) {
            priorityBanner.classList.remove('hidden');
            bannerTitle.textContent = "로컬 룰 폴백 진단 완료";
            bannerDesc.textContent = "AI 서버 응답을 받지 못했거나 네트워크가 불안정하여 브라우저 내장 한글/영문 규칙 파서로 즉시 대체 진단했습니다.";
        }
    }

    // ==========================================
    // 4-2. Cloudflare Workers 프록시 API 통신 함수
    // ==========================================
    async function callProxyAPIForName(proxyUrl, name) {
        // 프록시 주소 포맷 검증 및 정리
        let baseUrl = proxyUrl.trim();
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        const endpoint = `${baseUrl}/api/diagnose-name`;

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: name })
            });

            if (!response.ok) {
                const message = await readApiError(response);
                throw new Error(`프록시 서버 응답 실패 (Status: ${response.status}) ${message}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("[프록시 물질명 진단 실패]", error);
            return null;
        }
    }

    async function callProxyAPIForPdf(proxyUrl, sec2, sec15) {
        let baseUrl = proxyUrl.trim();
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        const endpoint = `${baseUrl}/api/diagnose-pdf`;

        try {
            const response = await fetchWithTimeout(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    sec2: sec2,
                    sec15: sec15
                })
            }, PDF_PROXY_TIMEOUT_MS);

            if (!response.ok) {
                const message = await readApiError(response);
                throw new Error(`프록시 서버 응답 실패 (Status: ${response.status}) ${message}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("[프록시 MSDS PDF 진단 실패]", error);
            showLoader(false);
            showStatusBanner("보안 프록시 연결 실패", `AI 서버 응답을 받지 못해 브라우저 로컬 룰 판정으로 전환합니다. ${error.message}`);
            return null;
        }
    }

    async function readApiError(response) {
        try {
            const text = await response.text();
            return text ? `- ${text.slice(0, 300)}` : '';
        } catch (error) {
            return '';
        }
    }

    async function fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }
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

    function parseAiJsonContent(content) {
        let cleaned = (content || '').trim();
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
        }

        const extractedJson = extractJsonObject(cleaned);
        if (!extractedJson) {
            throw new Error("AI 응답에서 JSON 객체를 찾지 못했습니다.");
        }

        const candidates = [extractedJson, `${extractedJson}}`, `${extractedJson}}}`];
        for (const candidate of candidates) {
            try {
                return JSON.parse(candidate);
            } catch (error) {
                // 다음 복구 후보를 시도합니다.
            }
        }

        throw new Error(`AI 응답 JSON 파싱 실패: ${extractedJson.slice(0, 300)}`);
    }

    function normalizeRegulationPayload(value) {
        const fallback = {
            san_an: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. MSDS 원문 제15조를 직접 확인해 주세요." },
            hwa_gwan: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. 화학물질관리법 대상 여부를 별도 확인해 주세요." },
            danger: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. 위험물안전관리법 유별 및 지정수량을 별도 확인해 주세요." },
            high_gas: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. 고압가스 해당 여부를 별도 확인해 주세요." },
            imdg: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. UN 번호 및 IMDG 등급을 별도 확인해 주세요." },
            iata: { status: "주의", desc: "AI 응답을 정규 JSON으로 해석하지 못했습니다. UN 번호 및 IATA DGR 등급을 별도 확인해 주세요." }
        };
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

CRITICAL INSTRUCTION: You MUST output ONLY valid JSON. No explanations, no thoughts, no markdown formatting. 첫 글자는 반드시 '{' 이어야 하며, 마지막 글자는 반드시 '}' 이어야 합니다. 어떠한 Markdown 코드 블록도 포함하지 말고 오직 순수 JSON 데이터만 반환하십시오. 각 desc는 한글 120자 이내로 간결하게 작성하십시오.
JSON 형식:
{
  "san_an": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "hwa_gwan": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "danger": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "high_gas": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "imdg": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},
  "iata": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"}
}`;

        const userPrompt = `MSDS 제2조 유해성 위험성:\n${sec2}\n\nMSDS 제15조 법적 규제현황:\n${sec15}\n\nCRITICAL: Output ONLY a JSON object. No other text.`;

        try {
            const response = await fetchWithTimeout(url, {
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
                    "max_tokens": 2048
                })
            }, PDF_PROXY_TIMEOUT_MS);

            if (!response.ok) {
                const message = await readApiError(response);
                throw new Error(`API 응답 실패 (Status: ${response.status}) ${message}`);
            }

            const resData = await response.json();
            const content = resData?.choices?.[0]?.message?.content?.trim();
            return normalizeRegulationPayload(parseAiJsonContent(content));
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

CRITICAL INSTRUCTION: You MUST output ONLY valid JSON. No explanations, no thoughts, no markdown formatting. 첫 글자는 반드시 '{' 이어야 하며, 마지막 글자는 반드시 '}' 이어야 합니다. 어떠한 Markdown 코드 블록도 포함하지 말고 오직 순수 JSON 데이터만 반환하십시오.
각 desc는 한글 120자 이내로 간결하게 작성하십시오.
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
                        {"role": "user", "content": `검색 물질명: ${name}\n\nCRITICAL: Output ONLY a JSON object. No other text.`}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 2048
                })
            });

            if (!response.ok) {
                const message = await readApiError(response);
                throw new Error(`API 응답 실패 (Status: ${response.status}) ${message}`);
            }

            const resData = await response.json();
            const content = resData?.choices?.[0]?.message?.content?.trim();
            const parsed = parseAiJsonContent(content);
            parsed.regulations = normalizeRegulationPayload(parsed.regulations);
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
    function isKeywordNegative(text, keyword, radius = 25) {
        const lowerText = text.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        let searchFrom = 0;
        let foundKeyword = false;

        while (searchFrom < lowerText.length) {
            const index = lowerText.indexOf(lowerKeyword, searchFrom);
            if (index === -1) return foundKeyword;
            foundKeyword = true;

            const start = Math.max(0, index - radius);
            const end = Math.min(lowerText.length, index + lowerKeyword.length + radius);
            const around = lowerText.slice(start, end);
            const compactAround = around.replace(/\s+/g, '');

            const isNegative = [
                '아님',
                '아니다',
                '아니함',
                '없음',
                '해당하지',
                '해당 안',
                '해당안',
                '해당 없음',
                '해당없음',
                '제외',
                '비해당',
                'not',
                'none',
                'no ',
                'not applicable',
                'not regulated',
                'free'
            ].some(term => {
                const lowerTerm = term.toLowerCase();
                return around.includes(lowerTerm) || compactAround.includes(lowerTerm.replace(/\s+/g, ''));
            });

            if (!isNegative) return false;
            searchFrom = index + lowerKeyword.length;
        }

        return foundKeyword;
    }

    function getAffirmedKeywords(text, keywords) {
        return keywords.filter(keyword => text.includes(keyword.toLowerCase()) && !isKeywordNegative(text, keyword));
    }

    function runClientSideRuleParser(sec15Text, fullText) {
        const parsed = {};
        const lowerText = sec15Text.toLowerCase();

        // 1) 산업안전보건법
        const sanAnKeywords = [
            "노출기준",
            "관리대상",
            "특별관리물질",
            "금지물질",
            "허가대상",
            "exposure limit",
            "occupational exposure",
            "controlled substance",
            "prohibited substance",
            "authorization substance"
        ];
        const sanAnFound = getAffirmedKeywords(lowerText, sanAnKeywords);
        if (
            sanAnFound.includes("금지물질") ||
            sanAnFound.includes("허가대상") ||
            sanAnFound.includes("prohibited substance") ||
            sanAnFound.includes("authorization substance")
        ) {
            parsed["san_an"] = {"status": "위험", "desc": `MSDS 우선 기재(로컬): ${sanAnFound.join(', ')} 법적 의무 확인 요망`};
        } else if (sanAnFound.length > 0) {
            parsed["san_an"] = {"status": "경고", "desc": `MSDS 우선 기재(로컬): ${sanAnFound.join(', ')} 대상에 해당함`};
        } else {
            parsed["san_an"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 특이 규제 내역 감지되지 않음"};
        }

        // 2) 화학물질관리법
        const hwaGwanKeywords = [
            "유독물질",
            "사고대비물질",
            "제한물질",
            "금지물질",
            "toxic substance",
            "accident preparedness",
            "restricted substance",
            "prohibited substance"
        ];
        const hwaGwanFound = getAffirmedKeywords(lowerText, hwaGwanKeywords);
        if (
            hwaGwanFound.includes("사고대비물질") ||
            hwaGwanFound.includes("금지물질") ||
            hwaGwanFound.includes("accident preparedness") ||
            hwaGwanFound.includes("prohibited substance")
        ) {
            parsed["hwa_gwan"] = {"status": "위험", "desc": `MSDS 우선 기재(로컬): 화관법 상의 ${hwaGwanFound.join(', ')} 고지`};
        } else if (hwaGwanFound.length > 0) {
            parsed["hwa_gwan"] = {"status": "경고", "desc": `MSDS 우선 기재(로컬): 화관법 상의 ${hwaGwanFound.join(', ')} 해당`};
        } else {
            parsed["hwa_gwan"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 특이 규제 내역 감지되지 않음"};
        }

        // 3) 위험물안전관리법
        const dangerMatch = sec15Text.match(/(제\s*\d\s*류\s*[^,\.\n]+|지정수량\s*\d+[^,\.\n]*|class\s*[1-9](?:\.[1-9])?[^,\.\n]*|packing\s*group\s*(?:i{1,3}|[123])[^,\.\n]*)/i);
        if (dangerMatch && !isKeywordNegative(sec15Text, dangerMatch[1], 25) && !isKeywordNegative(sec15Text, "위험물", 25)) {
            parsed["danger"] = {"status": "경고", "desc": `MSDS 우선 기재(로컬): 위험물안전법상 ${dangerMatch[1].trim()}`};
        } else {
            parsed["danger"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 특이 규제 내역 감지되지 않음"};
        }

        // 4) 고압가스안전관리법
        const hasHighGas = (lowerText.includes("고압가스") && !isKeywordNegative(sec15Text, "고압가스")) ||
            (lowerText.includes("high pressure gas") && !isKeywordNegative(sec15Text, "high pressure gas"));
        if (hasHighGas) {
            parsed["high_gas"] = {"status": "경고", "desc": "MSDS 우선 기재(로컬): 고압가스안전관리법 실린더 용기 적용 대상"};
        } else {
            parsed["high_gas"] = {"status": "안전", "desc": "MSDS 우선 기재(로컬): 해당 없음"};
        }

        // 5) 국제 운송 (IMDG/IATA)
        const unMatch = (sec15Text + " " + fullText).match(/UN\s*(\d{4})/i);
        if (unMatch && !isKeywordNegative(sec15Text + " " + fullText, unMatch[0], 25)) {
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
