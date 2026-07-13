import os
import sys
import subprocess
import json
import re
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# ==========================================
# 1. 의존성 자동 빌드 환경 설정 (pypdf, openai)
# ==========================================
try:
    import pypdf
except ImportError:
    print("[시스템] 'pypdf' 라이브러리가 존재하지 않습니다. 자동 설치를 시작합니다...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pypdf"])
        import pypdf
        print("[시스템] 'pypdf' 라이브러리가 성공적으로 설치되었습니다.")
    except Exception as e:
        print(f"[오류] 'pypdf' 자동 설치에 실패했습니다: {e}")

try:
    import openai
except ImportError:
    print("[시스템] 'openai' 라이브러리가 존재하지 않습니다. 자동 설치를 시작합니다...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "openai"])
        import openai
        print("[시스템] 'openai' 라이브러리가 성공적으로 설치되었습니다.")
    except Exception as e:
        print(f"[오류] 'openai' 자동 설치에 실패했습니다: {e}")

# ==========================================
# 2. 환경 변수 로드 (.env)
# ==========================================
def load_env():
    """상위 폴더 혹은 현재 폴더의 .env 파일에서 환경변수를 로드합니다."""
    env_paths = [
        Path(__file__).parent.parent / ".env",
        Path(__file__).parent / ".env"
    ]
    for env_path in env_paths:
        if env_path.exists():
            with open(env_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        os.environ.setdefault(key.strip(), value.strip())
            print(f"[시스템] 환경 변수 로드 완료: {env_path.name}")
            break

load_env()
DATA_GO_KEY = os.environ.get("DATA_GO_KEY", "")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

# ==========================================
# 3. 화학물질 규제 로컬 데이터 사전 (Mock / Fallback DB)
# ==========================================
MOCK_CHEMICALS = {
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
}

def get_fallback_chemical(query):
    query = query.strip().lower()
    for cas, data in MOCK_CHEMICALS.items():
        if cas == query:
            return data
    for cas, data in MOCK_CHEMICALS.items():
        if query in data["name_ko"].lower() or query in data["name_en"].lower():
            return data
    return None

# ==========================================
# 4. 공공 API 호출 함수 모음
# ==========================================
def fetch_keco_chemical(query):
    if not DATA_GO_KEY or DATA_GO_KEY == "YOUR_DATA_GO_KEY":
        return None
    try:
        url = "http://apis.data.go.kr/B552584/kecoapi/ncissbstn"
        params = {
            "serviceKey": DATA_GO_KEY,
            "pageNo": "1",
            "numOfRows": "5",
            "returnType": "json",
            "searchWrd": query
        }
        req_url = f"{url}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(req_url)
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data
    except Exception as e:
        print(f"[API 오류] 한국환경공단 API 호출 실패: {e}")
        return None

def fetch_kosha_msds(query):
    if not DATA_GO_KEY or DATA_GO_KEY == "YOUR_DATA_GO_KEY":
        return None
    try:
        url = "http://apis.data.go.kr/B552468/msdschem/getMsdsSubstanceList"
        params = {
            "serviceKey": DATA_GO_KEY,
            "pageNo": "1",
            "numOfRows": "5",
            "searchWrd": query,
            "returnType": "json"
        }
        req_url = f"{url}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(req_url)
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data
    except Exception as e:
        print(f"[API 오류] 안전보건공단 API 호출 실패: {e}")
        return None

def fetch_nfa_hazmat(query):
    if not DATA_GO_KEY or DATA_GO_KEY == "YOUR_DATA_GO_KEY":
        return None
    try:
        url = "http://apis.data.go.kr/1661000/materialInfoSvc/getMaterialList"
        params = {
            "serviceKey": DATA_GO_KEY,
            "pageNo": "1",
            "numOfRows": "5",
            "sbstnNm": query
        }
        req_url = f"{url}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(req_url)
        with urllib.request.urlopen(req, timeout=5) as response:
            res_body = response.read().decode("utf-8")
            return res_body
    except Exception as e:
        print(f"[API 오류] 소방청 API 호출 실패: {e}")
        return None

# ==========================================
# 5. NVIDIA Nemotron-3-Ultra-550b 연동 함수 (OpenAI SDK 사용)
# ==========================================
def analyze_with_nvidia_nemotron(sec_2_text, sec_15_text):
    """사용자가 제공한 실제 OpenAI API SDK 및 파라미터를 사용해 Nemotron-3-Ultra-550b-a55b 모델로 분석합니다."""
    if not NVIDIA_API_KEY or NVIDIA_API_KEY.startswith("YOUR_"):
        print("[시스템] NVIDIA API 키가 설정되지 않아 로컬 룰 엔진으로 대체 분석을 진행합니다.")
        return None

    try:
        from openai import OpenAI
        
        # 클라이언트 초기화
        client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=NVIDIA_API_KEY
        )

        system_prompt = (
            "당신은 대한민국 화학물질 규제 전문가입니다. 제공된 화학물질 MSDS의 유해성(2조) 및 법적규제현황(15조) 텍스트를 분석하여 "
            "요청하는 국내외 6가지 법적 규제에 저촉되는지 분류하고 근거를 요약하여 반환해야 합니다.\n"
            "분류할 대상 법령 및 키워드:\n"
            "1. san_an (산업안전보건법)\n"
            "2. hwa_gwan (화학물질관리법)\n"
            "3. danger (위험물안전관리법)\n"
            "4. high_gas (고압가스안전관리법)\n"
            "5. imdg (해상운송 IMDG)\n"
            "6. iata (항공운송 IATA DGR)\n\n"
            "반드시 아래의 엄격한 JSON 형식으로만 응답해야 합니다. 어떠한 Markdown 코드 블록(```json 등)도 포함하지 말고 오직 순수 JSON 데이터만 반환하십시오.\n"
            "JSON 형식:\n"
            "{\n"
            '  "san_an": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},\n'
            '  "hwa_gwan": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},\n'
            '  "danger": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},\n'
            '  "high_gas": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},\n'
            '  "imdg": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"},\n'
            '  "iata": {"status": "안전 또는 주의 또는 경고 또는 위험", "desc": "한글 법령 저촉 근거 및 요약"}\n'
            "}"
        )
        
        user_prompt = f"MSDS 제2조 유해성 위험성:\n{sec_2_text}\n\nMSDS 제15조 법적 규제현황:\n{sec_15_text}"

        print("[시스템] NVIDIA Nemotron-3-Ultra-550b 분석 요청 송신 중...")
        
        completion = client.chat.completions.create(
            model="nvidia/nemotron-3-ultra-550b-a55b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=1,
            top_p=0.95,
            max_tokens=2048,
            extra_body={"chat_template_kwargs": {"enable_thinking": True}, "reasoning_budget": 1024},
            stream=True
        )

        full_content = ""
        for chunk in completion:
            if not chunk.choices:
                continue
            # 생각(Reasoning) 과정을 터미널에 실시간 출력
            reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
            if reasoning:
                print(reasoning, end="", flush=True)
            if chunk.choices[0].delta.content is not None:
                full_content += chunk.choices[0].delta.content
                print(chunk.choices[0].delta.content, end="", flush=True)
        print() # 개행

        # 응답 텍스트 파싱
        full_content = full_content.strip()
        if full_content.startswith("```"):
            full_content = re.sub(r"^```[a-zA-Z]*\n", "", full_content)
            full_content = re.sub(r"\n```$", "", full_content)
            full_content = full_content.strip()

        parsed_json = json.loads(full_content)
        print("[시스템] NVIDIA Nemotron-3-Ultra-550b 모델을 통한 규제 법령 분석 완료.")
        return parsed_json
            
    except Exception as e:
        print(f"[LLM 오류] OpenAI SDK를 통한 NVIDIA API 호출 실패: {e}. 로컬 규칙 엔진으로 대체합니다.")
        return None

# ==========================================
# 6. 웹 서버 및 라우팅 (BaseHTTPRequestHandler)
# ==========================================
class RegulatorySearchHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        url_parsed = urllib.parse.urlparse(self.path)
        path = url_parsed.path
        
        if path == "/api/search":
            query_params = urllib.parse.parse_qs(url_parsed.query)
            q = query_params.get("q", [""])[0].strip()
            
            if not q:
                self.send_json({"error": "검색어를 입력해 주세요."}, status=400)
                return

            result = self.perform_integrated_search(q)
            self.send_json(result)
            return

        if path == "/" or path == "/index.html":
            self.serve_static_file("index.html", "text/html")
        elif path == "/style.css":
            self.serve_static_file("style.css", "text/css")
        elif path == "/app.js":
            self.serve_static_file("app.js", "application/javascript")
        else:
            self.send_error(404, "파일을 찾을 수 없습니다.")

    def do_POST(self):
        if self.path == "/api/analyze-pdf":
            try:
                content_type = self.headers.get("Content-Type", "")
                if not content_type.startswith("multipart/form-data"):
                    self.send_json({"error": "Content-Type이 multipart/form-data가 아닙니다."}, status=400)
                    return
                
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length)
                
                boundary = content_type.split("boundary=")[1].encode()
                parts = body.split(boundary)
                
                file_data = None
                for part in parts:
                    if b'filename="' in part:
                        headers_part, file_content = part.split(b"\r\n\r\n", 1)
                        if file_content.endswith(b"\r\n--"):
                            file_content = file_content[:-4]
                        elif file_content.endswith(b"\r\n"):
                            file_content = file_content[:-2]
                        file_data = file_content
                        break
                
                if not file_data:
                    self.send_json({"error": "업로드된 파일 데이터가 없습니다."}, status=400)
                    return

                temp_pdf_path = Path(__file__).parent / "temp_uploaded.pdf"
                with open(temp_pdf_path, "wb") as temp_f:
                    temp_f.write(file_data)
                
                analysis_result = self.analyze_msds_pdf(temp_pdf_path)
                
                if temp_pdf_path.exists():
                    os.remove(temp_pdf_path)
                
                self.send_json(analysis_result)
            except Exception as e:
                self.send_json({"error": f"PDF 분석 오류: {str(e)}"}, status=500)

    def serve_static_file(self, filename, content_type):
        filepath = Path(__file__).parent / filename
        if filepath.exists():
            self.send_response(200)
            self.send_header("Content-Type", f"{content_type}; charset=utf-8")
            self.end_headers()
            with open(filepath, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404, f"{filename} 파일을 찾을 수 없습니다.")

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    # ==========================================
    # 7. PDF MSDS 텍스트 분석 로직
    # ==========================================
    def analyze_msds_pdf(self, pdf_path):
        result = {
            "detected_cas": None,
            "detected_name": None,
            "section_2_text": "",
            "section_15_text": "",
            "parsed_regulations": {},
            "priority_mode": False
        }
        
        try:
            reader = pypdf.PdfReader(str(pdf_path))
            full_text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    full_text += page_text + "\n"

            # 1) CAS 번호 추출
            cas_pattern = re.compile(r"\b\d{2,7}-\d{2}-\d\b")
            cas_matches = cas_pattern.findall(full_text)
            unique_cas = list(dict.fromkeys(cas_matches))
            if unique_cas:
                valid_cas = [c for c in unique_cas if c != "7732-18-5"]
                result["detected_cas"] = valid_cas[0] if valid_cas else unique_cas[0]

            # 2) 물질명 추출
            name_pattern = re.compile(r"가\.\s*제품명\s*:\s*(.+)")
            name_match = name_pattern.search(full_text)
            if name_match:
                result["detected_name"] = name_match.group(1).strip()

            # 3) 섹션 2 및 섹션 15 영역 텍스트 추출
            sec_2_text = ""
            sec_2_match = re.search(r"2\.\s*유해성\s*·\s*위험성([\s\S]*?)(?=3\.)", full_text)
            if sec_2_match:
                sec_2_text = sec_2_match.group(1).strip()
                result["section_2_text"] = sec_2_text[:1000]

            sec_15_text = ""
            sec_15_match = re.search(r"15\.\s*법적\s*규제\s*현황([\s\S]*?)(?=16\.)", full_text)
            if not sec_15_match:
                sec_15_match = re.search(r"15\.\s*법적\s*규제\s*현황([\s\S]*)$", full_text)
            
            if sec_15_match:
                sec_15_text = sec_15_match.group(1).strip()
                result["section_15_text"] = sec_15_text[:1500]
                result["priority_mode"] = True
                
                # ==========================================
                # NVIDIA Nemotron LLM 분석 (우선순위 1)
                # ==========================================
                llm_parsed = analyze_with_nvidia_nemotron(sec_2_text[:800], sec_15_text[:1200])
                
                if llm_parsed and isinstance(llm_parsed, dict):
                    result["parsed_regulations"] = llm_parsed
                else:
                    # NVIDIA 분석 실패/키 누락 시 로컬 규칙 파서로 폴백 (우선순위 2)
                    print("[시스템] 로컬 키워드 규칙 매칭 파서를 폴백 구동합니다.")
                    parsed_regs = {}
                    
                    san_an_keywords = ["노출기준", "관리대상", "특별관리물질", "금지물질", "허가대상"]
                    san_an_found = [k for k in san_an_keywords if k in sec_15_text]
                    if "금지물질" in sec_15_text or "허가대상" in sec_15_text:
                        parsed_regs["san_an"] = {"status": "위험", "desc": f"MSDS 우선 기재(폴백): {', '.join(san_an_found)} 규제 해당"}
                    elif san_an_found:
                        parsed_regs["san_an"] = {"status": "경고", "desc": f"MSDS 우선 기재(폴백): {', '.join(san_an_found)} 대상물질"}
                    else:
                        parsed_regs["san_an"] = {"status": "안전", "desc": "MSDS 우선 기재(폴백): 특이 규제정보 감지되지 않음"}

                    hwa_gwan_keywords = ["유독물질", "사고대비물질", "제한물질", "금지물질"]
                    hwa_gwan_found = [k for k in hwa_gwan_keywords if k in sec_15_text]
                    if "사고대비물질" in sec_15_text or "금지물질" in sec_15_text:
                        parsed_regs["hwa_gwan"] = {"status": "위험", "desc": f"MSDS 우선 기재(폴백): 화관법 {', '.join(hwa_gwan_found)} 지정"}
                    elif hwa_gwan_found:
                        parsed_regs["hwa_gwan"] = {"status": "경고", "desc": f"MSDS 우선 기재(폴백): 화관법 {', '.join(hwa_gwan_found)} 관리 대상"}
                    else:
                        parsed_regs["hwa_gwan"] = {"status": "안전", "desc": "MSDS 우선 기재(폴백): 특이 규제정보 감지되지 않음"}

                    danger_match = re.search(r"(제\s*\d\s*류\s*[^,\.\n]+|지정수량\s*\d+[^,\.\n]*)", sec_15_text)
                    if danger_match:
                        parsed_regs["danger"] = {"status": "경고", "desc": f"MSDS 우선 기재(폴백): 위험물안전관리법 {danger_match.group(1).strip()}"}
                    else:
                        parsed_regs["danger"] = {"status": "안전", "desc": "MSDS 우선 기재(폴백): 특이 위험물 정보 감지되지 않음"}

                    if "고압가스" in sec_15_text:
                        parsed_regs["high_gas"] = {"status": "경고", "desc": "MSDS 우선 기재(폴백): 고압가스 안전관리법 규제대상 가스"}
                    else:
                        parsed_regs["high_gas"] = {"status": "안전", "desc": "MSDS 우선 기재(폴백): 해당 없음"}
                    
                    un_match = re.search(r"UN\s*(\d{4})", sec_15_text + " " + full_text)
                    if un_match:
                        un_no = un_match.group(1)
                        parsed_regs["imdg"] = {"status": "경고", "desc": f"MSDS 우선 기재(폴백): 해상운송제한 UN {un_no} 지정"}
                        parsed_regs["iata"] = {"status": "경고", "desc": f"MSDS 우선 기재(폴백): 항공운송제한 UN {un_no} 지정"}
                    else:
                        parsed_regs["imdg"] = {"status": "안전", "desc": "MSDS 우선 기재(폴백): 일반 화물 (제한 없음)"}
                        parsed_regs["iata"] = {"status": "안전", "desc": "MSDS 우선 기재(폴백): 일반 화물 (제한 없음)"}

                    result["parsed_regulations"] = parsed_regs
            
        except Exception as e:
            print(f"[PDF 분석 오류] {e}")
            
        return result

    # ==========================================
    # 8. 통합 규제 진단 수행 엔진
    # ==========================================
    def perform_integrated_search(self, q):
        local_data = get_fallback_chemical(q)
        
        if local_data:
            response_data = {
                "source": "로컬 규제 DB 매핑",
                "cas_no": local_data["cas_no"],
                "name_ko": local_data["name_ko"],
                "name_en": local_data["name_en"],
                "formula": local_data["formula"],
                "molecular_weight": local_data["molecular_weight"],
                "regulations": local_data["regulations"]
            }
        else:
            if re.match(r"^\d{2,7}-\d{2}-\d$", q):
                response_data = {
                    "source": "신규 CAS 번호 진단 에이전트",
                    "cas_no": q,
                    "name_ko": f"미등록 화학물질 ({q})",
                    "name_en": "Unknown Substance",
                    "formula": "확인불가",
                    "molecular_weight": "확인불가",
                    "regulations": {
                        "san_an": {"status": "주의", "desc": "산업안전보건법: 신규 유해인자 분류 대상 여부 추가 검토 요망"},
                        "hwa_gwan": {"status": "주의", "desc": "화학물질관리법: 화관법 영업허가대상 물질 및 물질확인명세 대상 가능성 있음"},
                        "danger": {"status": "주의", "desc": "위험물안전관리법: 인화성 시험 필요성 검토 권장"},
                        "high_gas": {"status": "안전", "desc": "고압가스안전관리법: 용기 상태 및 고압가스 여부 확인 요망"},
                        "imdg": {"status": "주의", "desc": "IMDG (해상운송): 화물 성상에 따른 UN No 판정 전까지 위험 운송 유의"},
                        "iata": {"status": "주의", "desc": "IATA (항공운송): 특수조항 및 항공사 위탁수하물 제한여부 점검"}
                    }
                }
            else:
                response_data = {
                    "source": "물질명 기반 동적 진단 에이전트",
                    "cas_no": "미확인",
                    "name_ko": q,
                    "name_en": "Unknown Substance",
                    "formula": "확인불가",
                    "molecular_weight": "확인불가",
                    "regulations": {
                        "san_an": {"status": "주의", "desc": "산업안전보건법: CAS No 미확인에 따른 보수적 MSDS 경고표지 의무 준수"},
                        "hwa_gwan": {"status": "주의", "desc": "화학물질관리법: 화학물질확인명세 미제출 시 규제 적용 여부 점검 요망"},
                        "danger": {"status": "주의", "desc": "위험물안전관리법: 지정수량의 배수 판단을 위해 성분 확인 요망"},
                        "high_gas": {"status": "안전", "desc": "고압가스안전관리법: 실온 보관 압력상태 확인 필요"},
                        "imdg": {"status": "주의", "desc": "IMDG (해상운송): 명확한 화학 성분 판정 전까지 비위험물로 임의 선적 금지"},
                        "iata": {"status": "주의", "desc": "IATA (항공운송): 항공 위험물 규정(DGR) 세부 확인 필요"}
                    }
                }

        response_data["api_connected"] = bool(DATA_GO_KEY and DATA_GO_KEY != "YOUR_DATA_GO_KEY")
        return response_data

# ==========================================
# 9. 메인 서버 실행부
# ==========================================
def run_server(port=8000):
    # Render 등 클라우드 환경에서는 PORT 환경변수를 주입해주므로 우선적으로 사용
    env_port = os.environ.get("PORT")
    if env_port:
        try:
            port = int(env_port)
        except ValueError:
            pass
            
    server_address = ("", port)
    httpd = HTTPServer(server_address, RegulatorySearchHandler)
    print(f"\n========================================================")
    print(f" 화학물질 법령규제 검색기 웹 서버 작동 중")
    print(f" 포트번호: {port}")
    print(f" 브라우저 주소창에 다음 주소를 입력하세요: http://localhost:{port}")
    print(f"========================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[시스템] 웹 서버 작동이 중지되었습니다.")
        sys.exit(0)

if __name__ == "__main__":
    run_server()

