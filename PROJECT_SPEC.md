# PROJECT_SPEC.md

Project: 전형별 채용공고 탐색기
Spec version: 2026-04-25
Last reviewed: 2026-04-25

## Product intent

This service helps Korean job seekers search large-company and public-sector recruitment postings by track and company name. It may discover multiple candidate sources, but it must select exactly one best source for analysis and render only one analyzed job result from that source.

This is not a multi-posting comparison service.

## Required user inputs

- Track: `고졸`, `대졸`, or `전체`
- High school status: `졸업예정자`, `졸업자`, `전체`, or `null`
- Company name

Show the high school status control only when the selected track is `고졸`. When the selected track is not `고졸`, treat high school status as `null` in the query and as `해당 없음` or `확인 불가` in display when needed.

## Non-negotiable data contract

- `candidateSources` may contain multiple candidate sources.
- `selectedSource` must be one object or `null`.
- `job` must be one object or `null`; never accept or render `job` arrays.
- If `selectedSource` is `null`, `job` must be `null`.
- If `job` exists, `job.sourceUrl` must exactly equal `selectedSource.url`.
- The final job analysis must use only the selected source.
- Do not merge information from multiple postings, years, tracks, roles, source URLs, PDFs, images, or recruitment pages.
- Unknown scalar values must be displayed as `확인 불가`.
- If no reliable searchable source is found, show the no-result state instead of fabricating a posting.

## Gemini behavior

- Use `gemini-2.0-flash`.
- Call Gemini only when the user clicks the search button.
- Use Google Search grounding or similar URL-grounded search only when the runtime environment supports it.
- If the runtime cannot access real web pages, PDFs, or images, do not invent results.
- Require JSON-only responses.
- Preserve the no-result JSON contract with `selectedSource: null` and `job: null`.

## Frontend validation behavior

- Parse AI output as JSON; show `AI 응답을 해석하지 못했어요. 다시 검색해 주세요.` on parse failure.
- Reject `job` arrays. Do not use the first item.
- Treat `selectedSource: null` as forcing `job: null`.
- Treat `job.sourceUrl !== selectedSource.url` as an integrity error.
- Normalize missing display fields to `확인 불가` and missing arrays to `[]`.

## UI and UX rules

- Use a simple, information-first card UI.
- Use black/white/gray as the main visual system.
- Use pale yellow `#FFFDCD` sparingly as the accent.
- Use `#111` for main text, `#FFF` for background, `#F7F7F7` for secondary background, and `#E5E5E5` for borders.
- Show selected source information before the analyzed job card.
- Show at most one analyzed job card.
- Candidate sources must not look like analyzed job results.
- Preserve mobile readability and clear empty/loading/error states.

## Security rule

Keep this warning comment near browser-side API-key storage code:

`실제 서비스 배포 시에는 API 키를 클라이언트에 저장하면 안 됩니다. 서버 환경변수 또는 서버리스 프록시를 통해 안전하게 호출해야 합니다.`

## Review checklist

- [ ] selectedSource is one object or null.
- [ ] job is one object or null and never an array.
- [ ] job.sourceUrl equals selectedSource.url when both exist.
- [ ] No multi-posting, multi-year, multi-track, or multi-source merge is introduced.
- [ ] Unknown values are shown as `확인 불가`.
- [ ] No reliable source means selectedSource null and job null.
- [ ] High school status appears only for 고졸 searches.
- [ ] Gemini/search limitations do not produce fabricated results.
- [ ] API-key production safety warning is preserved.
- [ ] UI remains source-first, card-based, readable, and mobile-friendly.
