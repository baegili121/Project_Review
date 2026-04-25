# 전형별 채용공고 탐색기

취준생이 기업명과 전형 조건을 입력하면 Gemini Search grounding을 통해 채용공고 후보를 찾고, 가장 적합한 공고 자료 1개만 선택해 분석하는 React + TypeScript 웹앱입니다.

## 배포 링크

GitHub Pages 배포 후 아래 주소로 접속할 수 있습니다.

```text
https://baegili121.github.io/Project_Review/
```

GitHub Pages가 아직 활성화되어 있지 않다면 저장소의 **Settings → Pages → Source**를 **GitHub Actions**로 설정해 주세요.

## 로컬 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 표시되는 주소로 접속한 뒤, 우측 상단의 🔑 버튼을 눌러 Gemini API 키를 입력하세요.

## 배포 방법

`main` 브랜치에 푸시하면 `.github/workflows/deploy.yml` 워크플로가 자동으로 실행됩니다.

```bash
npm install
npm run build
```

빌드 결과물은 GitHub Actions에서 `dist` 디렉터리를 GitHub Pages 아티팩트로 배포합니다.

## 핵심 원칙

- 후보 자료는 여러 개일 수 있습니다.
- 분석 대상은 반드시 `selectedSource` 1개입니다.
- 최종 렌더링은 `job` 1개만 허용합니다.
- `job.sourceUrl !== selectedSource.url`이면 결과를 표시하지 않습니다.
- 확인되지 않은 필드는 `확인 불가`로 표시합니다.

## 기술 스택

- React
- TypeScript
- Vite
- Tailwind CSS
- Gemini API `gemini-2.0-flash`
