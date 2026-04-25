import { useMemo, useState } from "react";
import { GoogleGenAI } from "@google/genai";

type Track = "고졸" | "대졸" | "전체";
type HighSchoolStatus = "졸업예정자" | "졸업자" | "전체" | null;
type SourceType = "PDF" | "이미지" | "공식 페이지" | "기타";
type Tab = "search" | "results";
type SearchStatus =
  | "idle"
  | "loading"
  | "success"
  | "cache-hit"
  | "api-key-missing"
  | "no-result"
  | "request-error"
  | "parse-error"
  | "validation-error";

interface CandidateSource {
  title: string;
  url: string;
  sourceType: SourceType;
  isOfficial: boolean;
  publishedDate: string;
  reason: string;
}

interface SelectedSource {
  title: string;
  url: string;
  sourceType: SourceType;
  isOfficial: boolean;
  publishedDate: string;
  selectionReason: string;
}

interface Job {
  companyName: string;
  title: string;
  position: string;
  applicationPeriod: string;
  deadline: string;
  track: string;
  highSchoolStatus: string;
  eligibility: string;
  bonusItems: string[];
  process: string[];
  sourceUrl: string;
  sourceType: string;
  publishedDate: string;
  evidenceSummary: string;
}

interface SearchResult {
  query: {
    companyName: string;
    track: string;
    highSchoolStatus: string | null;
  };
  candidateSources: CandidateSource[];
  selectedSource: SelectedSource | null;
  bonusTags: string[];
  job: Job | null;
  notices: string[];
}

const API_KEY_STORAGE_KEY = "geminiApiKey";
const CACHE_STORAGE_KEY = "recruitmentPostingExplorerCache";
const UNKNOWN = "확인 불가";
const TRACKS: Track[] = ["고졸", "대졸", "전체"];
const HIGH_SCHOOL_STATUSES: Exclude<HighSchoolStatus, null>[] = ["졸업예정자", "졸업자", "전체"];
const SOURCE_TYPES: SourceType[] = ["PDF", "이미지", "공식 페이지", "기타"];

class AppError extends Error {
  constructor(
    public kind: Exclude<SearchStatus, "idle" | "loading" | "success" | "cache-hit" | "no-result">,
    message: string
  ) {
    super(message);
  }
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) ?? "");
  const [isApiKeyOpen, setIsApiKeyOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [selectedTrack, setSelectedTrack] = useState<Track>("고졸");
  const [selectedHighSchoolStatus, setSelectedHighSchoolStatus] = useState<HighSchoolStatus>("전체");
  const [companyName, setCompanyName] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [message, setMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const cacheKey = useMemo(
    () => makeCacheKey(selectedTrack, selectedHighSchoolStatus, companyName),
    [selectedTrack, selectedHighSchoolStatus, companyName]
  );

  function handleApiKeyChange(nextKey: string) {
    setApiKey(nextKey);
    // 실제 서비스 배포 시에는 API 키를 클라이언트에 저장하면 안 됩니다. 서버 환경변수 또는 서버리스 프록시를 통해 안전하게 호출해야 합니다.
    localStorage.setItem(API_KEY_STORAGE_KEY, nextKey);
  }

  function handleTrackChange(track: Track) {
    setSelectedTrack(track);
    setSelectedHighSchoolStatus(track === "고졸" ? "전체" : null);
  }

  async function handleSearch(ignoreCache = false) {
    const trimmedCompanyName = companyName.trim();

    if (!apiKey.trim()) {
      setStatus("api-key-missing");
      setMessage("Gemini API 키를 먼저 입력해 주세요.");
      setIsApiKeyOpen(true);
      setActiveTab("search");
      return;
    }

    if (!trimmedCompanyName) {
      setStatus("request-error");
      setMessage("기업명을 입력해 주세요.");
      setActiveTab("search");
      return;
    }

    if (!ignoreCache) {
      const cached = readCache()[cacheKey];
      if (cached) {
        setResult(cached);
        setStatus(cached.selectedSource && cached.job ? "cache-hit" : "no-result");
        setMessage(cached.selectedSource && cached.job ? "이전 검색 결과를 불러왔어요." : "조건에 맞는 공고 자료를 찾지 못했어요.");
        setHasSearched(true);
        setActiveTab("results");
        return;
      }
    }

    setStatus("loading");
    setMessage("");

    try {
      const safeResult = await requestGeminiAnalysis({
        apiKey: apiKey.trim(),
        selectedTrack,
        selectedHighSchoolStatus,
        companyName: trimmedCompanyName
      });

      writeCache(cacheKey, safeResult);
      setResult(safeResult);
      setHasSearched(true);
      setStatus(safeResult.selectedSource && safeResult.job ? "success" : "no-result");
      setMessage(safeResult.selectedSource && safeResult.job ? "" : "조건에 맞는 공고 자료를 찾지 못했어요.");
      setActiveTab("results");
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError("request-error", "공고 자료를 찾지 못했어요. 기업명을 더 정확히 입력하거나 전형 조건을 변경해 다시 검색해 주세요.");
      setStatus(appError.kind);
      setMessage(appError.message);
      setHasSearched(true);
      setActiveTab(appError.kind === "api-key-missing" ? "search" : "results");
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#111]">
      <Header
        apiKey={apiKey}
        isApiKeyOpen={isApiKeyOpen}
        onApiKeyChange={handleApiKeyChange}
        onToggleApiKey={() => setIsApiKeyOpen((prev) => !prev)}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-5">
          {activeTab === "search" ? (
            <SearchTab
              selectedTrack={selectedTrack}
              selectedHighSchoolStatus={selectedHighSchoolStatus}
              companyName={companyName}
              status={status}
              message={message}
              onTrackChange={handleTrackChange}
              onHighSchoolStatusChange={setSelectedHighSchoolStatus}
              onCompanyNameChange={setCompanyName}
              onSearch={() => void handleSearch(false)}
              onRefreshSearch={() => void handleSearch(true)}
            />
          ) : (
            <ResultsTab
              hasSearched={hasSearched}
              result={result}
              status={status}
              message={message}
              onGoSearch={() => setActiveTab("search")}
              onRefreshSearch={() => void handleSearch(true)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Header({
  apiKey,
  isApiKeyOpen,
  onApiKeyChange,
  onToggleApiKey
}: {
  apiKey: string;
  isApiKeyOpen: boolean;
  onApiKeyChange: (apiKey: string) => void;
  onToggleApiKey: () => void;
}) {
  return (
    <header className="border-b border-[#E5E5E5] bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">전형별 채용공고 탐색기</h1>
          <p className="mt-1 text-xs text-neutral-500">선택한 공고 자료 1개만 기준으로 채용 정보를 정리합니다.</p>
        </div>
        <button
          type="button"
          onClick={onToggleApiKey}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E5E5E5] bg-[#F7F7F7] text-lg transition hover:bg-[#FFFDCD]"
          aria-label="Gemini API 키 입력창 열기"
        >
          🔑
        </button>
      </div>
      {isApiKeyOpen && <ApiKeyInput apiKey={apiKey} onApiKeyChange={onApiKeyChange} />}
    </header>
  );
}

function ApiKeyInput({ apiKey, onApiKeyChange }: { apiKey: string; onApiKeyChange: (apiKey: string) => void }) {
  return (
    <div className="border-t border-[#E5E5E5] bg-[#F7F7F7]">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
        <label className="text-sm font-medium" htmlFor="api-key">
          Gemini API 키
        </label>
        <input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder="AIza..."
          className="mt-2 w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm outline-none focus:border-[#111]"
        />
        <p className="mt-2 text-xs leading-5 text-neutral-500">
          입력한 키는 이 브라우저의 localStorage에 저장됩니다. 배포 서비스에서는 서버 프록시 방식으로 바꾸세요.
        </p>
      </div>
    </div>
  );
}

function Tabs({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <div className="inline-flex rounded-2xl border border-[#E5E5E5] bg-[#F7F7F7] p-1">
      {([
        ["search", "검색"],
        ["results", "결과"]
      ] as const).map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          onClick={() => onTabChange(tab)}
          className={`rounded-xl px-5 py-2 text-sm font-medium transition ${activeTab === tab ? "bg-[#FFFDCD] text-[#111]" : "text-neutral-500 hover:text-[#111]"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SearchTab({
  selectedTrack,
  selectedHighSchoolStatus,
  companyName,
  status,
  message,
  onTrackChange,
  onHighSchoolStatusChange,
  onCompanyNameChange,
  onSearch,
  onRefreshSearch
}: {
  selectedTrack: Track;
  selectedHighSchoolStatus: HighSchoolStatus;
  companyName: string;
  status: SearchStatus;
  message: string;
  onTrackChange: (track: Track) => void;
  onHighSchoolStatusChange: (status: HighSchoolStatus) => void;
  onCompanyNameChange: (companyName: string) => void;
  onSearch: () => void;
  onRefreshSearch: () => void;
}) {
  const isLoading = status === "loading";

  return (
    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5 rounded-2xl border border-[#E5E5E5] bg-[#FFFDCD] p-4">
        <p className="text-sm font-medium">분석 기준은 항상 공고 자료 1개입니다.</p>
        <p className="mt-1 text-sm leading-6 text-neutral-600">후보는 여러 개 찾을 수 있지만, 최종 채용 정보는 AI가 선택한 selectedSource 1개만 바탕으로 표시합니다.</p>
      </div>

      <div className="space-y-5">
        <FieldGroup label="전형 유형 선택">
          <SegmentedButtons values={TRACKS} selected={selectedTrack} onSelect={onTrackChange} />
        </FieldGroup>

        {selectedTrack === "고졸" && (
          <FieldGroup label="고졸 세부 유형 선택">
            <SegmentedButtons values={HIGH_SCHOOL_STATUSES} selected={selectedHighSchoolStatus ?? "전체"} onSelect={onHighSchoolStatusChange} />
          </FieldGroup>
        )}

        <FieldGroup label="기업명">
          <input
            type="text"
            value={companyName}
            onChange={(event) => onCompanyNameChange(event.target.value)}
            placeholder="한국전력공사, 삼성전자, 국민건강보험공단"
            className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-[#111]"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isLoading) onSearch();
            }}
          />
        </FieldGroup>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onSearch}
            disabled={isLoading}
            className="min-h-11 rounded-xl bg-[#111] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? "검색 중" : "검색"}
          </button>
          <button
            type="button"
            onClick={onRefreshSearch}
            disabled={isLoading}
            className="min-h-11 rounded-xl border border-[#E5E5E5] bg-white px-5 py-3 text-sm font-semibold text-[#111] transition hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-40"
          >
            새로고침 검색
          </button>
        </div>

        {isLoading && <LoadingCard />}
        {message && status !== "loading" && <StateCard message={message} />}
      </div>
    </section>
  );
}

function ResultsTab({
  hasSearched,
  result,
  status,
  message,
  onGoSearch,
  onRefreshSearch
}: {
  hasSearched: boolean;
  result: SearchResult | null;
  status: SearchStatus;
  message: string;
  onGoSearch: () => void;
  onRefreshSearch: () => void;
}) {
  if (status === "loading") {
    return <LoadingCard />;
  }

  if (!hasSearched) {
    return (
      <StateCard
        message="검색 조건을 입력하고 채용공고를 찾아보세요."
        description="전형 유형과 기업명을 입력하면 AI가 공고 후보를 찾고, 분석할 자료 1개만 선택합니다."
        action={<SecondaryButton onClick={onGoSearch}>검색 조건 입력하기</SecondaryButton>}
      />
    );
  }

  if (status === "parse-error" || status === "validation-error" || status === "request-error") {
    return (
      <StateCard
        message={message || "공고 자료를 찾지 못했어요. 기업명을 더 정확히 입력하거나 전형 조건을 변경해 다시 검색해 주세요."}
        action={<SecondaryButton onClick={onGoSearch}>검색 조건 수정하기</SecondaryButton>}
      />
    );
  }

  if (!result || !result.selectedSource || !result.job) {
    return (
      <StateCard
        message="조건에 맞는 공고 자료를 찾지 못했어요."
        description={result?.notices?.join(" ") || "기업명을 더 정확히 입력하거나 전형 조건을 변경해 다시 검색해 주세요."}
        action={<SecondaryButton onClick={onGoSearch}>검색 조건 수정하기</SecondaryButton>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {status === "cache-hit" && (
        <StateCard
          message="이전 검색 결과를 불러왔어요."
          description="최신 공고를 다시 확인하려면 새로고침 검색을 눌러 주세요."
          action={<SecondaryButton onClick={onRefreshSearch}>새로고침 검색</SecondaryButton>}
        />
      )}

      <SelectedSourceCard source={result.selectedSource} />
      <BonusTags tags={result.bonusTags} />
      <JobCard job={result.job} />

      {result.notices.length > 0 && (
        <section className="rounded-2xl border border-[#E5E5E5] bg-[#F7F7F7] p-4">
          <h3 className="text-sm font-semibold">안내 메시지</h3>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-neutral-600">
            {result.notices.map((notice, index) => (
              <li key={`${notice}-${index}`}>- {notice}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SelectedSourceCard({ source }: { source: SelectedSource }) {
  return (
    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-500">AI가 최종 선택한 공고 자료</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{source.title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{source.sourceType}</Badge>
          <Badge highlight={source.isOfficial}>{source.isOfficial ? "공식 출처" : "비공식 출처"}</Badge>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm leading-6">
        <InfoRow label="출처 URL">
          <a className="break-all underline decoration-neutral-300 underline-offset-4" href={source.url} target="_blank" rel="noreferrer">
            {source.url}
          </a>
        </InfoRow>
        <InfoRow label="공고 게시일 또는 자료 기준일">{source.publishedDate}</InfoRow>
        <InfoRow label="선택 이유">{source.selectionReason}</InfoRow>
      </div>
    </section>
  );
}

function BonusTags({ tags }: { tags: string[] }) {
  return (
    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-semibold">선택 자료에서 확인된 가점 항목</h3>
      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge key={tag} highlight>
              {tag}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">확인된 가점 항목이 없어요.</p>
      )}
    </section>
  );
}

function JobCard({ job }: { job: Job }) {
  return (
    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">{job.companyName}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{job.title}</h2>
        </div>
        <DeadlineBadge deadline={job.deadline} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge highlight>{job.track || UNKNOWN}</Badge>
        <Badge>{job.highSchoolStatus || UNKNOWN}</Badge>
      </div>

      <div className="mt-5 grid gap-3 text-sm leading-6 md:grid-cols-2">
        <InfoPanel label="직무" value={job.position} />
        <InfoPanel label="지원기간" value={job.applicationPeriod} />
        <InfoPanel label="마감일" value={job.deadline} />
        <InfoPanel label="공고 게시일 또는 자료 기준일" value={job.publishedDate} />
      </div>

      <div className="mt-5 space-y-4 text-sm leading-6">
        <InfoRow label="지원 자격">{job.eligibility}</InfoRow>
        <InfoRow label="가점 항목">{job.bonusItems.length > 0 ? job.bonusItems.join(", ") : UNKNOWN}</InfoRow>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold">전형 절차</h3>
        <ProcessTimeline steps={job.process} />
      </div>

      <div className="mt-6 rounded-2xl border border-[#E5E5E5] bg-[#F7F7F7] p-4 text-sm leading-6">
        <InfoRow label="근거 요약">{job.evidenceSummary}</InfoRow>
        <InfoRow label="출처 자료 링크">
          <a className="break-all underline decoration-neutral-300 underline-offset-4" href={job.sourceUrl} target="_blank" rel="noreferrer">
            {job.sourceUrl}
          </a>
        </InfoRow>
      </div>
    </section>
  );
}

function ProcessTimeline({ steps }: { steps: string[] }) {
  if (!steps.length) {
    return <p className="mt-2 text-sm text-neutral-500">확인된 전형 절차가 없어요.</p>;
  }

  return (
    <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li key={`${step}-${index}`} className="rounded-2xl border border-[#E5E5E5] bg-[#F7F7F7] p-3">
          <span className="text-xs font-medium text-neutral-500">STEP {index + 1}</span>
          <p className="mt-1 text-sm font-semibold">{step}</p>
        </li>
      ))}
    </ol>
  );
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const parsed = parseDeadline(deadline);
  if (!parsed) return <Badge>마감일 확인 불가</Badge>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return <Badge>마감됨</Badge>;
  if (diffDays <= 3) return <Badge highlight>마감 임박</Badge>;
  return <Badge>D-{diffDays}</Badge>;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      {children}
    </div>
  );
}

function SegmentedButtons<T extends string>({ values, selected, onSelect }: { values: T[]; selected: T; onSelect: (value: T) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          className={`min-h-11 rounded-xl border px-4 py-3 text-sm font-medium transition ${
            selected === value ? "border-[#111] bg-[#FFFDCD]" : "border-[#E5E5E5] bg-white hover:bg-[#F7F7F7]"
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function Badge({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-[#E5E5E5] px-3 py-1 text-xs font-medium text-[#111] ${highlight ? "bg-[#FFFDCD]" : "bg-[#F7F7F7]"}`}>
      {children}
    </span>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
      <dt className="font-medium text-neutral-500">{label}</dt>
      <dd className="text-[#111]">{children}</dd>
    </div>
  );
}

function InfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#F7F7F7] p-4">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value || UNKNOWN}</p>
    </div>
  );
}

function StateCard({ message, description, action }: { message: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#F7F7F7] p-5">
      <p className="text-sm font-medium text-[#111]">{message}</p>
      {description && <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-sm">
      <div className="h-2 w-2 animate-pulse rounded-full bg-[#111]" />
      <div className="mt-3 space-y-1 text-sm leading-6">
        <p className="font-medium">공고 자료 후보를 찾고 있어요.</p>
        <p className="text-neutral-500">가장 적합한 공고 자료 1개를 선택하고 있어요.</p>
        <p className="text-neutral-500">선택한 자료만 바탕으로 채용 정보를 정리하고 있어요.</p>
      </div>
    </div>
  );
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2 text-sm font-semibold hover:bg-[#F7F7F7]">
      {children}
    </button>
  );
}

async function requestGeminiAnalysis({
  apiKey,
  selectedTrack,
  selectedHighSchoolStatus,
  companyName
}: {
  apiKey: string;
  selectedTrack: Track;
  selectedHighSchoolStatus: HighSchoolStatus;
  companyName: string;
}): Promise<SearchResult> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: buildGeminiPrompt({ selectedTrack, selectedHighSchoolStatus, companyName }),
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text?.trim();
    if (!text) {
      throw new AppError("request-error", "검색 가능한 공고 자료를 찾지 못했습니다.");
    }

    return parseAndValidateSearchResult(text);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("request-error", "공고 자료를 찾지 못했어요. 기업명을 더 정확히 입력하거나 전형 조건을 변경해 다시 검색해 주세요.");
  }
}

function buildGeminiPrompt({
  selectedTrack,
  selectedHighSchoolStatus,
  companyName
}: {
  selectedTrack: Track;
  selectedHighSchoolStatus: HighSchoolStatus;
  companyName: string;
}) {
  const highSchoolStatusForPrompt = selectedTrack === "고졸" ? selectedHighSchoolStatus ?? "전체" : null;

  return `너는 한국 취업준비생을 위한 채용공고 조사 및 분석 도우미다.

사용자가 입력한 기업명과 전형 조건에 맞는 채용공고 자료를 찾고, 그중 가장 적합한 공고 자료 1개만 선택해 분석한다.

## 사용자 입력

기업명: ${companyName}
전형 유형: ${selectedTrack}
고졸 세부 유형: ${highSchoolStatusForPrompt}

## 핵심 원칙

- 공고 후보는 여러 개 찾을 수 있다.
- 그러나 분석 대상은 반드시 selectedSource 1개뿐이다.
- 최종 분석 결과도 job 1개만 반환한다.
- 여러 공고의 정보를 섞지 않는다.
- 다른 연도, 다른 직무, 다른 전형의 내용을 섞지 않는다.
- 선택한 selectedSource에 있는 내용만 분석한다.
- selectedSource에서 확인되지 않는 내용은 반드시 "확인 불가"라고 적는다.
- 절대 추측하지 않는다.
- 적합한 공고 자료를 찾지 못하면 selectedSource는 null, job은 null로 반환한다.

## 검색 가능성 원칙

- Google Search grounding 또는 URL 근거 검색을 사용할 수 있으면 실제 검색 결과를 바탕으로 후보 자료를 찾아라.
- 현재 실행 환경에서 실제 웹 검색, PDF 접근, 이미지 접근, URL 근거 검색이 불가능하다면 임의 결과를 생성하지 말고 no-result JSON으로 반환한다.
- 실제로 접근하거나 확인하지 못한 URL을 지어내지 않는다.

## 전형 조건 정의

전형 유형은 다음 중 하나다.

1. 고졸
2. 대졸
3. 전체

고졸 전형을 선택한 경우 고졸 세부 유형은 다음 중 하나다.

1. 졸업예정자
2. 졸업자
3. 전체

고졸 세부 유형 해석 기준:

- "졸업예정자"는 고등학교 졸업 예정자를 대상으로 하는 공고를 의미한다.
- "졸업자"는 고등학교를 이미 졸업한 지원자를 대상으로 하는 공고를 의미한다.
- "전체"는 고졸 졸업예정자와 졸업자를 모두 포함하거나, 둘 중 하나로 명확히 제한되지 않은 고졸 전형을 의미한다.
- selectedTrack이 "고졸"이 아닌 경우 highSchoolStatus는 "해당 없음"으로 처리한다.

## 공고 자료 탐색 기준

다음 자료를 후보로 찾는다.

- 기업 공식 채용 페이지
- 공공기관 공식 채용 페이지
- 공식 PDF 공고문
- 공식 이미지 공고문
- 공식 채용 관련 게시물
- 신뢰 가능한 채용 플랫폼의 공고 자료

출처 우선순위는 다음과 같다.

1. 기업 또는 공공기관 공식 채용 홈페이지
2. 공식 PDF 공고문
3. 공식 이미지 공고문
4. 공식 채용 관련 게시물
5. 신뢰 가능한 채용 플랫폼 자료

## selectedSource 선택 기준

후보 자료 중 가장 적합한 공고 자료 1개만 선택한다.

선택 기준:

- 사용자 입력 기업명과 일치하는가
- 사용자 입력 전형 유형과 일치하는가
- 고졸 전형인 경우 고졸 세부 유형과 일치하는가
- 실제 채용공고 자료인가
- 지원기간, 직무, 전형절차, 지원 자격 등 분석에 필요한 정보가 충분한가
- 최신 공고이거나 공고 기준일이 명확한가
- 출처가 신뢰 가능한가
- 공식 출처인가

## 분석 규칙

selectedSource로 선택한 1개 자료만 분석한다.

다음 정보를 selectedSource에서 확인해라.

- 기업명
- 채용명 또는 공고명
- 직무
- 지원기간
- 마감일
- 전형 유형
- 고졸 세부 유형
- 지원 자격
- 가점 항목
- 전형 절차
- 출처 URL
- 자료 유형
- 공고 게시일 또는 자료 기준일
- 근거 요약

특히 고졸 전형의 경우 다음을 반드시 확인한다.

- 졸업예정자만 지원 가능한지
- 졸업자만 지원 가능한지
- 졸업예정자와 졸업자 모두 지원 가능한지
- 나이, 학력, 재학 여부, 졸업일 기준 등의 제한이 있는지

자료에서 명확하지 않으면 "확인 불가"라고 표시한다.

## 응답 규칙

반드시 JSON 형식으로만 응답한다.
마크다운, 설명문, 코드블록을 붙이지 않는다.
sourceUrl은 반드시 selectedSource.url과 동일해야 한다.
selectedSource가 null이면 job도 반드시 null이어야 한다.
job은 배열이 아니라 단일 객체 또는 null이어야 한다.

## 응답 형식

{
  "query": {
    "companyName": "${companyName}",
    "track": "${selectedTrack}",
    "highSchoolStatus": ${highSchoolStatusForPrompt === null ? "null" : `"${highSchoolStatusForPrompt}"`}
  },
  "candidateSources": [
    {
      "title": "후보 자료 제목",
      "url": "후보 자료 URL",
      "sourceType": "PDF 또는 이미지 또는 공식 페이지 또는 기타",
      "isOfficial": true,
      "publishedDate": "공고 게시일 또는 확인 불가",
      "reason": "후보로 판단한 이유"
    }
  ],
  "selectedSource": {
    "title": "최종 선택한 공고 자료 제목",
    "url": "최종 선택한 공고 자료 URL",
    "sourceType": "PDF 또는 이미지 또는 공식 페이지 또는 기타",
    "isOfficial": true,
    "publishedDate": "공고 게시일 또는 확인 불가",
    "selectionReason": "이 자료 1개를 분석 기준으로 선택한 이유"
  },
  "bonusTags": ["어학", "자격증"],
  "job": {
    "companyName": "기업명",
    "title": "채용명 또는 공고명",
    "position": "직무",
    "applicationPeriod": "지원기간",
    "deadline": "YYYY-MM-DD 또는 확인 불가",
    "track": "고졸 또는 대졸 또는 전체 또는 확인 불가",
    "highSchoolStatus": "졸업예정자 또는 졸업자 또는 전체 또는 해당 없음 또는 확인 불가",
    "eligibility": "지원 자격 요약 또는 확인 불가",
    "bonusItems": ["어학", "자격증"],
    "process": ["서류", "필기", "면접", "최종합격"],
    "sourceUrl": "selectedSource.url과 동일한 URL",
    "sourceType": "PDF 또는 이미지 또는 공식 페이지 또는 기타",
    "publishedDate": "공고 게시일 또는 확인 불가",
    "evidenceSummary": "선택한 1개 자료에서 확인한 핵심 근거 요약"
  },
  "notices": [
    "확인 불가한 정보나 주의사항"
  ]
}

## 자료를 찾지 못한 경우

적합한 공고 자료를 찾지 못했다면 다음 형식으로 반환한다.

{
  "query": {
    "companyName": "${companyName}",
    "track": "${selectedTrack}",
    "highSchoolStatus": ${highSchoolStatusForPrompt === null ? "null" : `"${highSchoolStatusForPrompt}"`}
  },
  "candidateSources": [],
  "selectedSource": null,
  "bonusTags": [],
  "job": null,
  "notices": [
    "조건에 맞는 신뢰 가능한 공고 자료를 찾지 못했습니다."
  ]
}`;
}

function parseAndValidateSearchResult(rawText: string): SearchResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(rawText));
  } catch {
    throw new AppError("parse-error", "AI 응답을 해석하지 못했어요. 다시 검색해 주세요.");
  }

  return validateSearchResult(parsed);
}

function validateSearchResult(value: unknown): SearchResult {
  if (!isRecord(value)) {
    throw new AppError("validation-error", "AI 응답을 신뢰할 수 없어 결과를 표시하지 않았어요. 다시 검색해 주세요.");
  }

  if (Array.isArray(value.job)) {
    throw new AppError("validation-error", "AI 응답을 신뢰할 수 없어 결과를 표시하지 않았어요. 다시 검색해 주세요.");
  }

  const queryInput = isRecord(value.query) ? value.query : {};
  const selectedSourceInput = value.selectedSource;
  const jobInput = value.job;

  const selectedSource = selectedSourceInput === null || selectedSourceInput === undefined ? null : normalizeSelectedSource(selectedSourceInput);

  if (!selectedSource) {
    return {
      query: {
        companyName: cleanString(queryInput.companyName),
        track: cleanString(queryInput.track),
        highSchoolStatus: typeof queryInput.highSchoolStatus === "string" ? queryInput.highSchoolStatus : null
      },
      candidateSources: normalizeCandidateSources(value.candidateSources),
      selectedSource: null,
      bonusTags: normalizeStringArray(value.bonusTags),
      job: null,
      notices: normalizeStringArray(value.notices)
    };
  }

  if (!isRecord(jobInput)) {
    throw new AppError("validation-error", "AI 응답을 신뢰할 수 없어 결과를 표시하지 않았어요. 다시 검색해 주세요.");
  }

  const job = normalizeJob(jobInput);
  if (job.sourceUrl !== selectedSource.url) {
    throw new AppError("validation-error", "AI 응답을 신뢰할 수 없어 결과를 표시하지 않았어요. 다시 검색해 주세요.");
  }

  return {
    query: {
      companyName: cleanString(queryInput.companyName),
      track: cleanString(queryInput.track),
      highSchoolStatus: typeof queryInput.highSchoolStatus === "string" ? queryInput.highSchoolStatus : null
    },
    candidateSources: normalizeCandidateSources(value.candidateSources),
    selectedSource,
    bonusTags: normalizeStringArray(value.bonusTags),
    job,
    notices: normalizeStringArray(value.notices)
  };
}

function normalizeCandidateSources(value: unknown): CandidateSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((source) => ({
    title: cleanString(source.title),
    url: cleanString(source.url),
    sourceType: normalizeSourceType(source.sourceType),
    isOfficial: typeof source.isOfficial === "boolean" ? source.isOfficial : false,
    publishedDate: cleanString(source.publishedDate),
    reason: cleanString(source.reason)
  }));
}

function normalizeSelectedSource(value: unknown): SelectedSource {
  if (!isRecord(value)) {
    throw new AppError("validation-error", "AI 응답을 신뢰할 수 없어 결과를 표시하지 않았어요. 다시 검색해 주세요.");
  }

  return {
    title: cleanString(value.title),
    url: cleanString(value.url),
    sourceType: normalizeSourceType(value.sourceType),
    isOfficial: typeof value.isOfficial === "boolean" ? value.isOfficial : false,
    publishedDate: cleanString(value.publishedDate),
    selectionReason: cleanString(value.selectionReason)
  };
}

function normalizeJob(value: Record<string, unknown>): Job {
  return {
    companyName: cleanString(value.companyName),
    title: cleanString(value.title),
    position: cleanString(value.position),
    applicationPeriod: cleanString(value.applicationPeriod),
    deadline: cleanString(value.deadline),
    track: cleanString(value.track),
    highSchoolStatus: cleanString(value.highSchoolStatus),
    eligibility: cleanString(value.eligibility),
    bonusItems: normalizeStringArray(value.bonusItems),
    process: normalizeStringArray(value.process),
    sourceUrl: cleanString(value.sourceUrl),
    sourceType: cleanString(value.sourceType),
    publishedDate: cleanString(value.publishedDate),
    evidenceSummary: cleanString(value.evidenceSummary)
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalizeSourceType(value: unknown): SourceType {
  return typeof value === "string" && SOURCE_TYPES.includes(value as SourceType) ? (value as SourceType) : "기타";
}

function cleanString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : UNKNOWN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripCodeFence(value: string) {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function parseDeadline(deadline: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const [year, month, day] = deadline.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function makeCacheKey(track: Track, highSchoolStatus: HighSchoolStatus, companyName: string) {
  const normalizedStatus = track === "고졸" ? highSchoolStatus ?? "전체" : "null";
  return `${track}:${normalizedStatus}:${companyName.trim()}`;
}

function readCache(): Record<string, SearchResult> {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(key: string, value: SearchResult) {
  const cache = readCache();
  cache[key] = value;
  localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
}
