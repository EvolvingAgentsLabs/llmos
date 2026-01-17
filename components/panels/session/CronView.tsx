'use client';

export default function CronView() {
  const cronLog = {
    name: 'Evolution (User)',
    status: 'completed',
    startTime: '14:00:00',
    duration: '3m 24s',
    logs: [
      { time: '14:00:00', message: 'Starting evolution cron' },
      { time: '14:00:01', message: 'Loading traces from: /volumes/users/alice/' },
      { time: '14:00:05', message: 'Found 95 traces' },
      { time: '14:00:10', message: 'Analyzing patterns...' },
      { time: '14:01:23', message: 'Pattern detected: "VQE optimization"', highlight: true },
      { time: '14:01:23', message: '  Occurrences: 3', indent: true },
      { time: '14:01:23', message: '  Confidence: 95%', indent: true },
      { time: '14:01:23', message: '  Traces: #12, #34, #48', indent: true },
      { time: '14:01:45', message: 'Generating skill draft...' },
      { time: '14:02:10', message: 'Skill created: quantum-optimization.md', highlight: true },
      { time: '14:02:11', message: 'Pattern detected: "API endpoint creation"', highlight: true },
      { time: '14:02:11', message: '  Occurrences: 5', indent: true },
      { time: '14:02:11', message: '  Confidence: 87%', indent: true },
      { time: '14:02:45', message: 'Generating skill draft...' },
      { time: '14:03:10', message: 'Skill created: api-endpoint-pattern.md', highlight: true },
      { time: '14:03:24', message: 'Evolution complete', highlight: true },
      { time: '14:03:24', message: '  Patterns: 5 detected', indent: true },
      { time: '14:03:24', message: '  Skills: 2 created', indent: true },
      { time: '14:03:24', message: '  Committed: e9f2a1c', indent: true },
    ],
    patterns: [
      {
        name: 'VQE Optimization',
        occurrences: 3,
        confidence: 0.95,
        skill: 'quantum-optimization.md',
      },
      {
        name: 'API Endpoint Creation',
        occurrences: 5,
        confidence: 0.87,
        skill: 'api-endpoint-pattern.md',
      },
    ],
    skills: [
      { name: 'quantum-optimization.md' },
      { name: 'api-endpoint-pattern.md' },
    ],
    commitHash: 'e9f2a1c',
  };

  return (
    <div className="h-full flex flex-col">
      {/* Cron Header */}
      <div className="p-4 border-b border-terminal-border">
        <h2 className="terminal-heading text-sm mb-2">
          CRON: {cronLog.name}
        </h2>
        <div className="text-xs text-terminal-fg-secondary space-y-1">
          <div>Ran: {cronLog.startTime} | Duration: {cronLog.duration}</div>
          <div className="git-badge git-badge-committed">
            {cronLog.status}
          </div>
        </div>
      </div>

      {/* Execution Log */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="terminal-heading text-xs mb-2">EXECUTION LOG</h3>
        <div className="code-block space-y-0.5">
          {cronLog.logs.map((log, index) => (
            <div
              key={index}
              className={`
                font-mono text-xs
                ${log.highlight ? 'text-terminal-accent-green' : 'text-terminal-fg-secondary'}
                ${log.indent ? 'ml-4' : ''}
              `}
            >
              <span className="text-terminal-fg-tertiary">[{log.time}]</span>{' '}
              {log.message}
            </div>
          ))}
        </div>
      </div>

      {/* Patterns Detected */}
      <div className="p-4 border-t border-terminal-border">
        <h3 className="terminal-heading text-xs mb-2">
          PATTERNS DETECTED ({cronLog.patterns.length})
        </h3>
        <div className="space-y-2">
          {cronLog.patterns.map((pattern, index) => (
            <div key={index} className="bg-terminal-bg-tertiary p-2 rounded">
              <div className="text-sm text-terminal-accent-green mb-1">
                {index + 1}. {pattern.name}
              </div>
              <div className="text-xs text-terminal-fg-secondary space-y-0.5 ml-4">
                <div>Occurrences: {pattern.occurrences}</div>
                <div>Confidence: {(pattern.confidence * 100).toFixed(0)}%</div>
                <div className="text-terminal-accent-blue">
                  Skill: {pattern.skill}
                </div>
              </div>
              <div className="flex gap-2 mt-2 ml-4">
                <button className="btn-terminal text-xs py-0.5 px-2">
                  View Traces
                </button>
                <button className="btn-terminal text-xs py-0.5 px-2">
                  View Skill
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Skills Generated */}
      <div className="p-4 border-t border-terminal-border">
        <h3 className="terminal-heading text-xs mb-2">
          SKILLS GENERATED ({cronLog.skills.length})
        </h3>
        <div className="space-y-2">
          {cronLog.skills.map((skill, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-terminal-accent-green">✨</span>
              <span className="text-sm flex-1">{skill.name}</span>
              <button className="btn-terminal text-xs py-0.5 px-2">
                Promote to Team
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Git Commit */}
      <div className="p-4 border-t border-terminal-border bg-terminal-bg-tertiary">
        <h3 className="terminal-heading text-xs mb-2">GIT COMMIT</h3>
        <div className="space-y-1 text-xs text-terminal-fg-secondary">
          <div>Commit: <span className="git-badge git-badge-committed">{cronLog.commitHash}</span></div>
          <div>Author: alice-cron</div>
          <div>Message: Evolution: {cronLog.skills.length} skills from {cronLog.patterns.length} patterns detected</div>
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn-terminal text-xs py-1 px-2">
            View Commit
          </button>
          <button className="btn-terminal-secondary text-xs py-1 px-2">
            View Diff
          </button>
        </div>
      </div>
    </div>
  );
}
