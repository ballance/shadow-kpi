'use client';

import { useRouter } from 'next/navigation';

interface Row {
  teamId: string;
  teamName: string;
  workspaceId: string;
  workspaceName: string;
  linked: { workspaceId: string; slackUserId: string } | null;
}

export function LinkedAccountsClient({ teams }: { teams: Row[] }) {
  const router = useRouter();
  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        None of your teams are connected to Slack yet. A team admin can wire it up under team
        settings.
      </p>
    );
  }
  async function unlink(workspaceId: string) {
    await fetch('/api/slack/link/unlink', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    });
    router.refresh();
  }
  return (
    <ul className="space-y-3">
      {teams.map((t) => (
        <li
          key={t.teamId}
          className="flex items-center justify-between rounded border p-3"
        >
          <div>
            <div className="font-medium">{t.teamName}</div>
            <div className="text-sm text-muted-foreground">
              Slack workspace: {t.workspaceName}
              {t.linked && (
                <>
                  {' '}
                  · linked as <code>{t.linked.slackUserId}</code>
                </>
              )}
            </div>
          </div>
          {t.linked ? (
            <button
              onClick={() => unlink(t.workspaceId)}
              className="rounded border px-3 py-1 text-sm"
            >
              Unlink
            </button>
          ) : (
            <a
              href={`/api/slack/link?team_id=${t.teamId}`}
              className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
            >
              Link Slack
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
