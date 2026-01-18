import React, { useContext, useState } from 'react';
import { SocketContext } from '../context/SocketContext';
import PowerCard from './PowerCard';
import './PowerCard.css';

export default function PowerCardsHand({ 
  powerCards = [], 
  roomCode, 
  isMyTurn, 
  gamePhase,
  onCardPlayed 
}) {
  const socket = useContext(SocketContext);
  const [playingCard, setPlayingCard] = useState(null);

  const handlePlayCard = (cardUniqueId) => {
    const card = powerCards.find(c => c.uniqueId === cardUniqueId);
    if (!card) return;

    // Handle different card types that need additional input
    switch (card.id) {
      case 'yes_you':
        // Will prompt for target player selection
        setPlayingCard({ card, requiresInput: 'targetPlayer' });
        break;
      case 'hot_potato':
        // Will prompt for spin result
        setPlayingCard({ card, requiresInput: 'spin' });
        break;
      case '404_error':
        // Will prompt for rank selection from bag
        setPlayingCard({ card, requiresInput: 'rankSelection' });
        break;
      case 'show_me':
        setPlayingCard({ card, requiresInput: 'rankSelection' });
        break;
      case 'wild_style':
        setPlayingCard({ card, requiresInput: 'rankSelection' });
        break;
      case 'mirrored':
        setPlayingCard({ card, requiresInput: 'spin' });
        break;
      case 'burned':
        setPlayingCard({ card, requiresInput: 'spin' });
        break;
      case 'drained':
        setPlayingCard({ card, requiresInput: 'spin' });
        break;
      default:
        // Cards that don't need extra input
        console.log(`Playing card ${card.name} (${card.uniqueId})`);
        socket.emit('play_spell', roomCode, cardUniqueId, {
          requiresTurn: isMyTurn,
          gamePhase: gamePhase
        });
        if (onCardPlayed) onCardPlayed(card);
        break;
    }
  };

  const handleSellCard = (cardUniqueId) => {
    const card = powerCards.find(c => c.uniqueId === cardUniqueId);
    console.log(`Selling card ${card?.name} (${cardUniqueId}) for ${card?.sellValue} BB`);
    socket.emit('sell_power_card', roomCode, cardUniqueId);
  };

  if (!powerCards || powerCards.length === 0) {
    return (
      <div className="power-cards-hand">
        <div className="power-cards-label">No power cards yet</div>
      </div>
    );
  }

  return (
    <>
      <div className="power-cards-hand">
        <div className="power-cards-label">
          Power Cards ({powerCards.length}/4)
        </div>
        {powerCards.map((card) => (
          <PowerCard
            key={card.uniqueId}
            card={card}
            onPlay={handlePlayCard}
            onSell={handleSellCard}
            isMyTurn={isMyTurn}
            gamePhase={gamePhase}
          />
        ))}
      </div>

      {/* Additional input dialogs for cards that need them */}
      {playingCard && playingCard.requiresInput === 'targetPlayer' && (
        <TargetPlayerDialog
          card={playingCard.card}
          roomCode={roomCode}
          onConfirm={(targetId) => {
            socket.emit('play_spell', roomCode, playingCard.card.uniqueId, {
              requiresTurn: isMyTurn,
              gamePhase: gamePhase,
              targetPlayerId: targetId
            });
            if (onCardPlayed) onCardPlayed(playingCard.card);
            setPlayingCard(null);
          }}
          onCancel={() => setPlayingCard(null)}
        />
      )}
    </>
  );
}

// Helper component for selecting target player
function TargetPlayerDialog({ card, roomCode, onConfirm, onCancel }) {
  const socket = useContext(SocketContext);
  const [players, setPlayers] = useState([]);

  React.useEffect(() => {
    // Listen for room update to get list of other players
    socket.on('room_update', (playerList) => {
      setPlayers(playerList.filter(p => p.id !== socket.id));
    });

    return () => {
      socket.off('room_update');
    };
  }, [socket]);

  return (
    <div className="dialog-overlay">
      <div className="dialog-content">
        <h3>Select Target Player</h3>
        <p>{card.description}</p>
        <div className="target-players">
          {players.map((player) => (
            <button
              key={player.id}
              className="target-btn"
              onClick={() => onConfirm(player.id)}
            >
              {player.name}
            </button>
          ))}
        </div>
        <button className="btn-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
