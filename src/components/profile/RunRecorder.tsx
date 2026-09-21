/**
 * Watches for a run to end and banks it into the local profile.
 *
 * Renders nothing. It lives at the app level rather than inside the game-over
 * screen so a player who closes the window the instant they bust still gets
 * credited, and so a reconnect cannot bank the same run twice.
 */
import { useEffect } from 'react';
import { useView } from '@/store/net';
import { alreadyBanked, recordRun } from './profile';

export default function RunRecorder() {
  const view = useView();

  useEffect(() => {
    if (!view || view.phase !== 'gameover') return;

    const key = `${view.code}:${view.handNumber}`;
    if (alreadyBanked(key)) return;

    const me = view.players.find((p) => p.isYou);
    if (!me) return;

    // Placement is by chips, with the declared winner first.
    const ranked = [...view.players].sort((a, b) => {
      if (a.id === view.winnerId) return -1;
      if (b.id === view.winnerId) return 1;
      return b.chips - a.chips;
    });
    const placement = ranked.findIndex((p) => p.id === me.id) + 1;

    let bestHand = '';
    let bestCat = -1;
    let impossible = 0;
    for (const entry of view.payout?.entries ?? []) {
      if (entry.playerId !== me.id) continue;
      if (entry.cat > bestCat) { bestCat = entry.cat; bestHand = entry.handName; }
      if (entry.impossible) impossible += 1;
    }

    recordRun({
      at: Date.now(),
      placement: placement > 0 ? placement : view.players.length,
      players: view.players.length,
      handsWon: me.handsWon,
      antesSurvived: view.ante,
      bestHand,
      bestCat,
      impossible,
      omens: view.omens.map((o) => o.id),
      relics: me.relics,
      won: view.winnerId === me.id,
    });
  }, [view?.phase, view?.code, view?.handNumber, view]);

  return null;
}
