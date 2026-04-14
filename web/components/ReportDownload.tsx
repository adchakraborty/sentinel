'use client';

interface ReportDownloadProps {
  htmlReport?: string;
  markdownReport?: string;
  sarifReport?: string;
  jsonReport?: string;
}

export default function ReportDownload({ htmlReport, markdownReport, sarifReport, jsonReport }: ReportDownloadProps) {
  const download = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buttons = [
    {
      label: 'HTML Report', content: htmlReport, filename: 'sentinel-report.html', mime: 'text/html',
      color: 'border-danger/40 text-danger hover:bg-danger/10 hover:border-danger/60',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
      ),
    },
    {
      label: 'Markdown', content: markdownReport, filename: 'sentinel-report.md', mime: 'text/markdown',
      color: 'border-accent/40 text-accent hover:bg-accent/10 hover:border-accent/60',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
      ),
    },
    {
      label: 'SARIF', content: sarifReport, filename: 'sentinel-report.sarif', mime: 'application/json',
      color: 'border-success/40 text-success hover:bg-success/10 hover:border-success/60',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
      ),
    },
    {
      label: 'JSON', content: jsonReport, filename: 'sentinel-report.json', mime: 'application/json',
      color: 'border-info/40 text-info hover:bg-info/10 hover:border-info/60',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {buttons.map((btn) => (
        <button
          key={btn.label}
          disabled={!btn.content}
          onClick={() => btn.content && download(btn.content, btn.filename, btn.mime)}
          className={`border ${btn.color} rounded-xl p-4 text-center transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed hover:shadow-lg hover:-translate-y-0.5 group`}
        >
          <div className="flex justify-center mb-2 opacity-70 group-hover:opacity-100 transition-opacity">{btn.icon}</div>
          <div className="text-xs font-bold">{btn.label}</div>
        </button>
      ))}
    </div>
  );
}
