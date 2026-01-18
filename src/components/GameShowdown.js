import { useMemo, useEffect, useContext, useState } from 'react';
import { SocketContext } from '../context/SocketContext';
import './GameShowdown.css';

// Server-side wizard hand evaluator - we'll use the standard evaluator for now
// but this is prepared for Poker for Wizards custom hands
function evaluateWinnersWizard(players) {
    // Call the server to evaluate hands with Wizard rules
    // For now, return the players as-is for the client to render
    return players;
}

function convertCardCode(code) {
    let rank = code.slice(0, code.length - 1);
    const suit = code.slice(-1).toLowerCase();

    if (rank === '10' || rank === '0') rank = 'T';

    return rank.toUpperCase() + suit;
}

export default function GameShowdown({ showdownData, players, roomCode }) {
    const socket = useContext(SocketContext);
    const [showRewardChoice, setShowRewardChoice] = useState(false);
    const [selectedReward, setSelectedReward] = useState(null);
    const [evaluated, setEvaluated] = useState([]);

    useEffect(() => {
        if (!showdownData) return;

        // Simple hand evaluation - could be enhanced with Wizard rules
        const playersWithHands = players.map(p => {
            const playerCards = (showdownData.hands[p.id] || []).map(c => convertCardCode(c.code));
            const communityCards = showdownData.communityCards.map(c => convertCardCode(c.code));
            const allCards = [...playerCards, ...communityCards];

            return {
                id: p.id,
                name: p.name,
                cards: allCards,
                playerCards: playerCards,
                handName: determineHandRank(allCards)
            };
        });

        // Determine winner(s)
        const winners = determineWinners(playersWithHands);
        const updatedPlayers = playersWithHands.map(p => ({
            ...p,
            isWinner: winners.some(w => w.id === p.id)
        }));

        setEvaluated(updatedPlayers);

        // After 2 seconds, show reward choice to winner
        if (winners.length > 0 && winners.length === 1) {
            const timer = setTimeout(() => {
                const currentPlayer = updatedPlayers.find(p => p.id === socket.id);
                if (currentPlayer && currentPlayer.isWinner) {
                    setShowRewardChoice(true);
                } else {
                    // Non-winners, continue to next round
                    setTimeout(() => {
                        socket.emit('force_fold_others', roomCode, winners[0].id);
                    }, 500);
                }
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [showdownData, players, socket, roomCode]);

    if (!showdownData) return null;

    const winner = evaluated.find(p => p.isWinner);
    const currentPlayer = evaluated.find(p => p.id === socket.id);
    const isWinner = currentPlayer && currentPlayer.isWinner;

    if (showRewardChoice && isWinner) {
        return (
            <div className="showdown-container reward-choice">
                <h2>🎉 You Won!</h2>
                <p className="pot-amount">Pot: {showdownData.potAmount || 'TBD'} chips</p>
                
                <div className="reward-options">
                    <div className="reward-option">
                        <h3>Option A: Full Pot + Power Card</h3>
                        <p>Take the entire pot and draw a power card</p>
                        <button 
                            className="btn-reward"
                            onClick={() => {
                                socket.emit('choose_pot_reward', roomCode, 'full_pot_plus_card');
                                setSelectedReward('full_pot_plus_card');
                                setShowRewardChoice(false);
                            }}
                        >
                            Take Full Pot + Card
                        </button>
                    </div>

                    <div className="reward-option">
                        <h3>Option B: Half Pot + Steal Card</h3>
                        <p>Take half the pot and steal a power card from an opponent</p>
                        <div className="target-players">
                            {players.filter(p => p.id !== socket.id).map(p => (
                                <button
                                    key={p.id}
                                    className="btn-target"
                                    onClick={() => {
                                        socket.emit('choose_pot_reward', roomCode, 'half_pot_plus_steal', p.id);
                                        setSelectedReward('half_pot_plus_steal');
                                        setShowRewardChoice(false);
                                    }}
                                >
                                    Steal from {p.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (selectedReward) {
        return (
            <div className="showdown-container">
                <h2>Processing reward...</h2>
                <p>Your choice has been recorded. Starting next round...</p>
            </div>
        );
    }

    return (
        <div className="showdown-container">
            <h2>🔥 Showdown!</h2>

            {/* COMMUNITY CARDS ROW */}
            <div className="community-cards-row">
                {showdownData.communityCards.map(c => (
                    <img
                        key={c.code}
                        src={c.image}
                        alt={c.code}
                        className="community-card-img"
                    />
                ))}
            </div>

            {/* PLAYERS CARDS ROW */}
            <div className="players-cards-row">
                {evaluated.map(p => (
                    <div
                        key={p.id}
                        className={`player-hand ${p.isWinner ? 'winner' : ''}`}
                    >
                        <div>
                            <p>{p.name} got a {p.handName}.</p>
                            {p.isWinner && (
                                <p style={{ marginTop: 0, color: 'lime', fontWeight: 'bold' }}>
                                    🏆 WINNER 🏆
                                </p>
                            )}
                        </div>
                        <div className="player-cards">
                            {(p.playerCards || []).map(c => (
                                <img
                                    key={c}
                                    src={`https://deckofcardsapi.com/static/images/${c}.png`}
                                    alt={c}
                                    className="player-hand-card"
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Helper function to determine hand rank
function determineHandRank(cards) {
    const ranks = {
        'Royal Flush': 10,
        'Straight Flush': 9,
        'Four of a Kind': 8,
        'Full House': 7,
        'Flush': 6,
        'Straight': 5,
        'Three of a Kind': 4,
        'Two Pair': 3,
        'Pair': 2,
        'High Card': 1
    };

    // Simple detection - this is a placeholder
    // In production, use pokersolver or the wizard evaluator
    if (hasPair(cards)) return 'Pair';
    return 'High Card';
}

function determineWinners(players) {
    // This is a simplified version - in production, properly evaluate hands
    // and return the winner(s)
    if (players.length === 0) return [];
    
    // For now, just return first player (should be replaced with proper evaluation)
    return [players[0]];
}

function hasPair(cards) {
    const ranks = cards.map(c => c.charAt(0));
    return new Set(ranks).size < ranks.length;
}