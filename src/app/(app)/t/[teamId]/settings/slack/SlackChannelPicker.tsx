'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SlackChannelPickerProps {
  teamId: string;
  workspaces: Array<{ workspaceId: string; workspaceName: string }>;
  channels: Array<{ id: string; name: string }>;
  existingMapping: { workspaceId: string; channelId: string; channelName: string } | null;
  justInstalled: boolean;
}

export function SlackChannelPicker(props: SlackChannelPickerProps) {
  const router = useRouter();
  const [selectedWorkspace, setSelectedWorkspace] = useState(
    props.existingMapping?.workspaceId ?? props.workspaces[0]?.workspaceId ?? '',
  );
  const [selectedChannelId, setSelectedChannelId] = useState(
    props.existingMapping?.channelId ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!selectedChannelId) {
      setError('Pick a channel first.');
      return;
    }
    setBusy(true);
    setError(null);
    const channel = props.channels.find((c) => c.id === selectedChannelId);
    if (!channel) {
      setBusy(false);
      setError('Unknown channel');
      return;
    }
    const res = await fetch(`/api/teams/${props.teamId}/slack-channel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: selectedWorkspace,
        channelId: channel.id,
        channelName: channel.name,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Failed to save');
      return;
    }
    router.refresh();
  }

  async function unlink() {
    setBusy(true);
    await fetch(`/api/teams/${props.teamId}/slack-channel`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded border p-4">
      {props.justInstalled && (
        <div className="text-sm text-green-600">
          Workspace installed. Pick a channel below.
        </div>
      )}
      <label className="block text-sm">
        Workspace
        <select
          className="ml-2 rounded border px-2 py-1"
          value={selectedWorkspace}
          onChange={(e) => setSelectedWorkspace(e.target.value)}
        >
          {props.workspaces.map((w) => (
            <option key={w.workspaceId} value={w.workspaceId}>
              {w.workspaceName}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Channel
        <select
          className="ml-2 rounded border px-2 py-1"
          value={selectedChannelId}
          onChange={(e) => setSelectedChannelId(e.target.value)}
        >
          <option value="">— pick one —</option>
          {props.channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
      </label>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
        >
          Save
        </button>
        {props.existingMapping && (
          <button onClick={unlink} disabled={busy} className="rounded border px-3 py-1">
            Disconnect channel
          </button>
        )}
      </div>
    </div>
  );
}
