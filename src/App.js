import React, { useEffect, useState } from 'react';
import { SocketContext, socket } from './context/SocketContext';
import Lobby from './components/Lobby';
import Room from './components/Room';

function App() {
  const [players, setPlayers] = useState([]);
  const [inRoom, setInRoom] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    console.log('Socket ID:', socket.id);
    console.log('Socket connected:', socket.connected);

    // Listen for updated players list from server
    socket.on('room_update', (playerList) => {
      console.log('Room updated with players:', playerList);
      setPlayers(playerList);

      // When room_update comes, mark user as in room
      setInRoom(true);

      // Set isHost by checking if current socket id is host
      const currentPlayer = playerList.find((p) => p.id === socket.id);
      setIsHost(!!currentPlayer?.isHost);
    });

    socket.on('join_error', (msg) => {
      console.error('Join error:', msg);
      alert('Join error: ' + msg);
    });

    return () => {
      socket.off('room_update');
      socket.off('join_error');
    };
  }, []);

  // Called from Lobby to join a room
  const handleJoinRoom = (room, name) => {
    console.log('Attempting to join room:', room, 'as', name);
    setRoomCode(room);
    socket.emit('join_room', room, name);
  };

  return (
    <SocketContext.Provider value={socket}>
      <div className="App">
        <h1>🃏 Poker Room Multiplayer 🃏</h1>
        {!inRoom ? (
          <Lobby onJoinRoom={handleJoinRoom} />
        ) : (
          <Room players={players} roomCode={roomCode} isHost={isHost} />
        )}
      </div>
    </SocketContext.Provider>
  );
}

export default App;
