export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

function linkButton(url: string, label = 'View market'): unknown {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: label },
        url,
        style: 'primary',
      },
    ],
  };
}

function section(markdownText: string): unknown {
  return { type: 'section', text: { type: 'mrkdwn', text: markdownText } };
}

function contextLine(text: string): unknown {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

export function marketCreatedChannel(p: {
  baseUrl: string;
  teamName: string;
  marketId: string;
  title: string;
  lockupAtUnix: number;
  creatorDisplay: string;
}): SlackMessage {
  const url = `${p.baseUrl}/markets/${p.marketId}`;
  const text = `📊 New market in ${p.teamName}: ${p.title}`;
  return {
    text,
    blocks: [
      section(`*📊 New market: ${p.title}*`),
      contextLine(
        `${p.teamName} · locks <!date^${p.lockupAtUnix}^{date_short_pretty} at {time}|soon> · created by ${p.creatorDisplay}`,
      ),
      linkButton(url, 'Place a bet'),
    ],
  };
}

export function marketLockedChannel(p: {
  baseUrl: string;
  teamName: string;
  marketId: string;
  title: string;
  betCount: number;
  poolTotal: number;
  yesPct: number;
  noPct: number;
}): SlackMessage {
  const url = `${p.baseUrl}/markets/${p.marketId}`;
  const text = `🔒 Locked: ${p.title} — ${p.teamName} · ${p.betCount} bets · pool ${p.poolTotal} 🍩`;
  return {
    text,
    blocks: [
      section(`*🔒 Locked: ${p.title}*`),
      contextLine(
        `${p.teamName} · ${p.betCount} bets · pool ${p.poolTotal} 🍩 (YES ${p.yesPct}% / NO ${p.noPct}%)`,
      ),
      linkButton(url),
    ],
  };
}

export function marketResolvedChannel(p: {
  baseUrl: string;
  teamName: string;
  marketId: string;
  title: string;
  outcome: 'yes' | 'no';
  winnerCount: number;
  poolTotal: number;
  callerDisplay: string;
}): SlackMessage {
  const url = `${p.baseUrl}/markets/${p.marketId}`;
  const text = `✅ Resolved ${p.outcome.toUpperCase()}: ${p.title} — ${p.winnerCount} winners split ${p.poolTotal} 🍩`;
  return {
    text,
    blocks: [
      section(`*✅ Resolved ${p.outcome.toUpperCase()}: ${p.title}*`),
      contextLine(
        `${p.teamName} · ${p.winnerCount} winners split ${p.poolTotal} 🍩 · called by ${p.callerDisplay}`,
      ),
      linkButton(url, 'View payout breakdown'),
    ],
  };
}

export function marketLockedDm(p: {
  baseUrl: string;
  marketId: string;
  title: string;
  stake: number;
  side: 'yes' | 'no';
  creatorDisplay: string;
}): SlackMessage {
  const url = `${p.baseUrl}/markets/${p.marketId}`;
  const text = `🔒 ${p.title} locked. You staked ${p.stake} 🍩 on ${p.side.toUpperCase()}.`;
  return {
    text,
    blocks: [
      section(`*🔒 A market you bet on just locked:*\n${p.title}`),
      contextLine(
        `You staked ${p.stake} 🍩 on ${p.side.toUpperCase()}. Outcome resolves when ${p.creatorDisplay} calls it.`,
      ),
      linkButton(url),
    ],
  };
}

export function marketResolvedDmWinner(p: {
  baseUrl: string;
  marketId: string;
  title: string;
  outcome: 'yes' | 'no';
  stake: number;
  payout: number;
  newBalance: number;
}): SlackMessage {
  const url = `${p.baseUrl}/markets/${p.marketId}`;
  const delta = p.payout - p.stake;
  const text = `🎉 You won ${delta} 🍩 — ${p.title} resolved ${p.outcome.toUpperCase()}. New balance: ${p.newBalance} 🍩`;
  return {
    text,
    blocks: [
      section(`*🎉 You won ${delta} 🍩*`),
      contextLine(
        `${p.title} — resolved ${p.outcome.toUpperCase()}\nYou staked ${p.stake} → received ${p.payout} (+${delta}) · new balance: ${p.newBalance} 🍩`,
      ),
      linkButton(url, 'View payout'),
    ],
  };
}

export function marketResolvedDmLoser(p: {
  baseUrl: string;
  marketId: string;
  title: string;
  outcome: 'yes' | 'no';
  stake: number;
  newBalance: number;
}): SlackMessage {
  const url = `${p.baseUrl}/markets/${p.marketId}`;
  const text = `💀 You lost ${p.stake} 🍩 — ${p.title} resolved ${p.outcome.toUpperCase()}. New balance: ${p.newBalance} 🍩`;
  return {
    text,
    blocks: [
      section(`*💀 You lost ${p.stake} 🍩*`),
      contextLine(
        `${p.title} — resolved ${p.outcome.toUpperCase()}\nYour stake stays in the pool · new balance: ${p.newBalance} 🍩`,
      ),
      linkButton(url),
    ],
  };
}

export function marketVoidedDm(p: {
  baseUrl: string;
  marketId: string;
  title: string;
  stake: number;
}): SlackMessage {
  const url = `${p.baseUrl}/markets/${p.marketId}`;
  const text = `↩️ Refund: ${p.title} was voided. Your ${p.stake} 🍩 stake has been returned.`;
  return {
    text,
    blocks: [
      section(`*↩️ Refund: ${p.title}*`),
      contextLine(`The market was voided. Your ${p.stake} 🍩 stake has been returned.`),
      linkButton(url),
    ],
  };
}

export function plainTextMessage(text: string): SlackMessage {
  return { text, blocks: [section(text)] };
}
