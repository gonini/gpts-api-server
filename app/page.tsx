import Link from "next/link";

const highlights = [
  {
    title: "간단한 호출",
    description: "REST 방식으로 티커와 날짜만 전달하면 됩니다.",
  },
  {
    title: "자동 계산",
    description: "실적 발표 전후의 CAR과 누적 수익률을 바로 제공합니다.",
  },
  {
    title: "투명한 출처",
    description: "Yahoo Finance와 SEC 데이터를 기반으로 응답을 구성합니다.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-[60vh] max-w-4xl flex-col justify-center px-6 py-24">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">GPTs API Server</p>
        <h1 className="mt-6 text-4xl font-semibold md:text-5xl">Analyze API</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
          미국 상장사의 실적 이벤트를 간단한 API로 받아볼 수 있습니다. 요청 한 번으로 변곡점,
          가격 반응, 데이터 출처를 함께 확인하세요.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/docs/analyze"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            문서 보기
          </Link>
          <a
            href="mailto:hello@gpts-api-server.ai"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            문의하기
          </a>
        </div>
      </div>

      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-2xl font-semibold text-slate-900">빠른 시작</h2>
          <p className="mt-3 text-sm text-slate-600">필수 파라미터만 채워 샘플 요청을 보내보세요.</p>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">
{`curl "https://gpts-api-server.vercel.app/api/analyze?ticker=NBR&from=2023-01-01&to=2024-12-31"`}
          </pre>
        </div>
      </section>
    </main>
  );
}
