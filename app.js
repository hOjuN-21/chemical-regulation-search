/* ==========================================================
   화학물질 법령규제 검색기 - 클라이언트측 동작 스크립트 app.js
   ========================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // 1. UI 엘리먼트 참조
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const loader = document.getElementById('loader');
    const resultSection = document.getElementById('result-section');
    const priorityBanner = document.getElementById('priority-banner');

    // 결과 렌더링용 참조
    const resCas = document.getElementById('res-cas');
    const resNameKo = document.getElementById('res-name-ko');
    const resNameEn = document.getElementById('res-name-en');
    const resFormula = document.getElementById('res-formula');
    const resWeight = document.getElementById('res-weight');

    // 규제 카드 참조
    const cards = {
        san_an: document.getElementById('card-san-an'),
        hwa_gwan: document.getElementById('card-hwa-gwan'),
        danger: document.getElementById('card-danger'),
        high_gas: document.getElementById('card-high-gas'),
        imdg: document.getElementById('card-imdg'),
        iata: document.getElementById('card-iata')
    };

    // 원본 대조 참조
    const rawSection = document.getElementById('raw-section-container');
    const rawSec2 = document.getElementById('raw-sec-2');
    const rawSec15 = document.getElementById('raw-sec-15');

    // 2. 이벤트 리스너 등록
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // 드래그앤드롭 핸들링
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    // 3. 비동기 검색 요청 처리
    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query) {
            alert('검색하실 물질명 또는 CAS 번호를 입력해주세요.');
            return;
        }

        showLoader(true);
        hideResults();

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || '검색 과정에서 오류가 발생했습니다.');
            }
            const data = await response.json();
            renderResults(data);
        } catch (error) {
            alert(error.message);
        } finally {
            showLoader(false);
        }
    }

    // 4. PDF 업로드 및 분석 처리
    async function handleFileUpload(file) {
        if (file.type !== 'application/pdf') {
            alert('PDF 형식의 MSDS 문서만 업로드할 수 있습니다.');
            return;
        }

        showLoader(true);
        hideResults();

        const formData = new FormData();
        formData.append('file', file);

        try {
            // PDF 파싱 요청
            const response = await fetch('/api/analyze-pdf', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'PDF 분석에 실패했습니다.');
            }

            const pdfResult = await response.json();
            
            // 추출된 CAS 또는 이름을 기반으로 규제 매핑 데이터 2차 조회
            let query = pdfResult.detected_cas || pdfResult.detected_name;
            if (!query) {
                // 수동 입력을 위한 대체
                query = prompt('PDF에서 물질 식별 정보(CAS 번호 또는 물질명)를 추출하지 못했습니다. 진단하려는 물질명을 수동으로 입력해 주세요:');
                if (!query) {
                    showLoader(false);
                    return;
                }
            }

            const searchRes = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            if (!searchRes.ok) {
                throw new Error('API 규제 정보를 가져오지 못했습니다.');
            }
            const finalData = await searchRes.json();

            // MSDS 우선 원칙(MSDS Priority Rule) 적용 및 병합
            if (pdfResult.priority_mode) {
                finalData.msds_priority = true;
                // MSDS 분석에서 검출된 규제가 있으면 기존 API/로컬 DB 결과를 덮어씌움
                for (const key in pdfResult.parsed_regulations) {
                    if (pdfResult.parsed_regulations[key].status !== '안전') {
                        finalData.regulations[key] = pdfResult.parsed_regulations[key];
                    } else if (!finalData.regulations[key]) {
                        finalData.regulations[key] = pdfResult.parsed_regulations[key];
                    }
                }
                // MSDS 원본 파일에서 추출된 기본 정보 보강
                if (pdfResult.detected_name && finalData.name_ko.includes('미등록')) {
                    finalData.name_ko = pdfResult.detected_name;
                }
                if (pdfResult.detected_cas) {
                    finalData.cas_no = pdfResult.detected_cas;
                }
                
                // 원본 텍스트 대조용 세팅
                finalData.section_2_text = pdfResult.section_2_text;
                finalData.section_15_text = pdfResult.section_15_text;
            }

            renderResults(finalData);
        } catch (error) {
            alert(error.message);
        } finally {
            showLoader(false);
        }
    }

    // 5. 결과 시각화 렌더링
    function renderResults(data) {
        // 프로필 바인딩
        resCas.textContent = `CAS ${data.cas_no || '미지정'}`;
        resNameKo.textContent = data.name_ko;
        resNameEn.textContent = data.name_en || 'Unknown Substance';
        resFormula.textContent = data.formula || '-';
        resWeight.textContent = data.molecular_weight || '-';

        // MSDS 우선 배너 토글
        if (data.msds_priority) {
            priorityBanner.classList.remove('hidden');
        } else {
            priorityBanner.classList.add('hidden');
        }

        // 규제 카드 렌더링
        for (const key in cards) {
            const card = cards[key];
            const info = data.regulations[key] || { status: '안전', desc: '해당 사항 또는 규제 정보가 없습니다.' };
            
            const badge = card.querySelector('.status-badge');
            const desc = card.querySelector('.card-desc');

            // 뱃지 글자 및 스타일
            badge.textContent = info.status;
            badge.className = 'status-badge'; // reset
            
            if (info.status === '안전') badge.classList.add('status-safe');
            else if (info.status === '주의') badge.classList.add('status-info');
            else if (info.status === '경고') badge.classList.add('status-warning');
            else if (info.status === '위험') badge.classList.add('status-danger');

            desc.textContent = info.desc;
        }

        // PDF 원본 텍스트 매치 표시
        if (data.msds_priority && (data.section_2_text || data.section_15_text)) {
            rawSection.classList.remove('hidden');
            rawSec2.textContent = data.section_2_text || '기재 내용이 없거나 파싱하지 못했습니다.';
            rawSec15.textContent = data.section_15_text || '기재 내용이 없거나 파싱하지 못했습니다.';
        } else {
            rawSection.classList.add('hidden');
        }

        resultSection.classList.remove('hidden');
        // 결과창으로 스무스 스크롤
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 6. UI 제어 유틸리티
    function showLoader(show) {
        if (show) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }

    function hideResults() {
        resultSection.classList.add('hidden');
        rawSection.classList.add('hidden');
    }
});
