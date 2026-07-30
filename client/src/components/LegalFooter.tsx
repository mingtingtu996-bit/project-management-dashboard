const ICP_RECORD_NUMBER = '粤ICP备2026075705号-2'

export function LegalFooter() {
  return (
    <footer className="border-t border-slate-200/80 px-6 py-4 text-center text-xs text-slate-500">
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noreferrer"
        className="transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {ICP_RECORD_NUMBER}
      </a>
    </footer>
  )
}
