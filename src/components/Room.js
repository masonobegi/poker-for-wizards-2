import { useContext, useEffect, useState } from 'react';
import { SocketContext } from '../context/SocketContext';
import PokerGameInProgress from './PokerGameInProgress';
import GameShowdown from './GameShowdown';
import PowerCardsHand from './PowerCardsHand';

function Room({ players: initialPlayers, roomCode, isHost }) {
  const socket = useContext(SocketContext);

  const [players, setPlayers] = useState(initialPlayers);
  const [gameStarted, setGameStarted] = useState(false);
  const [loopNum, setLoopNum] = useState(0);
  const [betSize, setBetSize] = useState(1000); // Updated to 1000 chips
  const [communityCards, setCommunityCards] = useState([]);

  const [currentTurnId, setCurrentTurnId] = useState('');
  const [hand, setHand] = useState([]);
  const [error, setError] = useState('');
  const [pot, setPot] = useState(0);
  const [showdownData, setShowdownData] = useState(null);
  const [message, setMessage] = useState('');
  const [gamePhase, setGamePhase] = useState(''); // Poker for Wizards: track game phase for power cards
  const [powerCards, setPowerCards] = useState([]); // Poker for Wizards: player's power cards
  const [smallBlindPlayer, setSmallBlindPlayer] = useState('');
  const [bigBlindPlayer, setBigBlindPlayer] = useState('');

  const currentPlayer = players.find(p => p.id === socket.id);
  const folded = currentPlayer?.folded || false;
  const isYourTurn = currentTurnId === socket.id;

  const chipBalance = currentPlayer?.chipBalance || 0;
  const rawToCall = betSize - (currentPlayer?.bet || 0);
  const toCall = Math.max(0, rawToCall); // Ensure toCall is never negative

  useEffect(() => {

    socket.on('game_started', () => {
      setGameStarted(true);
      setMessage('');
    });

    socket.on('blind_positions', ({ smallBlindPlayer, bigBlindPlayer }) => {
      setSmallBlindPlayer(smallBlindPlayer);
      setBigBlindPlayer(bigBlindPlayer);
    });

    socket.on('new_loop', (newLoopNum) => {
      setLoopNum(newLoopNum);
      setError('');
      setMessage('');
    });

    socket.on('current_turn', ({ playerId }) => {
      setCurrentTurnId(playerId);
    });
    socket.on('update_bet_size', setBetSize);
    socket.on('update_pot', setPot);
    socket.on('update_community_cards', setCommunityCards);

    socket.on('deal_hand', (cards) => {
      setHand(cards);
      setError('');
      setMessage('');
      setShowdownData(null);
    });

    socket.on('round_winner', ({ winnerName, amount, reason }) => {
      const msg = reason
        ? `${reason} ${winnerName} wins ${amount} chips.`
        : `${winnerName} wins ${amount} chips.`;
      setMessage(msg);
    });

    socket.on('force_fold', (roomCode) => {
      socket.emit('fold', roomCode);
    });

    socket.on('player_folded', ({ name }) => {
      setMessage(`${name} folded.`);
    });

    socket.on('room_update', (updatedPlayers) => {
      setPlayers(updatedPlayers);
      
      // Poker for Wizards: Update current player's power cards
      const currentPlayer = updatedPlayers.find(p => p.id === socket.id);
      if (currentPlayer && currentPlayer.powerCards) {
        setPowerCards(currentPlayer.powerCards);
      }
    });

    socket.on('update_bet_size', (newBetSize) => {
      setBetSize(newBetSize);
    });

    socket.on('showdown', (data) => {
      setShowdownData(data);
      setMessage('Showdown! Revealing hands...');
    });

    socket.on('host_disconnected', () => {
      setGameStarted(false);
      setMessage('⚠️ Host disconnected. Game ended.');
    });

    socket.on('game_ended', () => {
      setGameStarted(false);
      setMessage('Game ended.');
    });

    socket.on('action_error', (msg) => {
      setError(msg);
    });

    socket.on('spell_played', ({ playerName, spellName }) => {
      setMessage(`✨ ${playerName} played ${spellName}!`);
    });

    socket.on('card_sold', ({ playerName, sellValue }) => {
      setMessage(`💰 ${playerName} sold a card for ${sellValue} chips!`);
    });

    return () => {
      socket.off('game_started');
      socket.off('new_loop');
      socket.off('your_turn');
      socket.off('current_turn');
      socket.off('update_bet_size');
      socket.off('update_pot');
      socket.off('update_community_cards');
      socket.off('deal_hand');
      socket.off('round_winner');
      socket.off('force_fold');
      socket.off('player_folded');
      socket.off('room_update');
      socket.off('showdown');
      socket.off('host_disconnected');
      socket.off('game_ended');
      socket.off('action_error');
      socket.off('spell_played');
      socket.off('card_sold');
    };
  }, [socket]);

  const startGame = () => socket.emit('start_game', roomCode);

  const fold = () => {
    setError('');
    socket.emit('fold', roomCode);
  };

  const call = () => {
    console.log(`[Call] toCall=${toCall}, chipBalance=${chipBalance}`);
    if (toCall > 0) {
      // Must call
      if (chipBalance < toCall) {
        setError(`You need ${toCall} chips to call but only have ${chipBalance}.`);
        return;
      }
    }
    // If toCall === 0, this is a check (which is always allowed)
    console.log(`[Call] Emitting call_bet for ${toCall === 0 ? 'CHECK' : 'CALL'}`);
    socket.emit('call_bet', roomCode);
    setError('');
  };

  const raise = (amount) => {
    const total = toCall + amount;
    if (chipBalance < total) {
      setError(`You need ${total} chips to raise by ${amount}.`);
      return;
    }
    socket.emit('raise_bet', roomCode, betSize + amount);
    setError('');
  };

  return (
    <div className="room">
      <h2>Hello {currentPlayer?.name}, you're in room '{roomCode}'</h2>

      {/* Poker for Wizards: Display power cards */}
      {gameStarted && (
        <PowerCardsHand
          powerCards={powerCards}
          roomCode={roomCode}
          isMyTurn={isYourTurn}
          gamePhase={gamePhase}
          onCardPlayed={(card) => {
            setMessage(`You played ${card.name}!`);
          }}
        />
      )}

      {showdownData ? (
        <GameShowdown 
        showdownData={showdownData} 
        players={players}
        roomCode={roomCode}
        />
      ) : gameStarted ? (
        <PokerGameInProgress
          isYourTurn={isYourTurn}
          currentTurnPlayerName={players.find(p => p.id === currentTurnId)?.name || ''}
          communityCards={communityCards}
          hand={hand}
          chipBalance={chipBalance}
          betSize={betSize}
          toCall={toCall}
          pot={pot}
          loopNum={loopNum}
          message={message}
          errorMsg={error}
          fold={fold}
          call={call}
          raise={raise}
          isNextTurn={folded || !isYourTurn}
          smallBlindPlayer={smallBlindPlayer}
          bigBlindPlayer={bigBlindPlayer}
          currentPlayerName={currentPlayer?.name || ''}
        />
      ) : (
        <div>
          <h4>Players in the room:</h4>
          <ul>
            {players.map(p => (
              <li key={p.id}>{p.name} {p.isHost && '(Host)'}</li>
            ))}
          </ul>
          {isHost && (
            <button className="btn start-btn" onClick={startGame}>
              Start Game (Poker for Wizards 🧙)
            </button>
          )}
          {message && <p>{message}</p>}
        </div>
      )}
    </div>
  );
}

export default Room;
