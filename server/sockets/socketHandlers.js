const {
  createRoom,
  joinRoom,
  startGame,
  getPlayerHand,
  getRoomPlayers,
  roomExists,
  getRoom,
  removePlayer,
  getActivePlayers,
  advanceLoop,
  rankPlayerHands,
  drawPowerCard,
  playPowerCard,
  sellPowerCard,
  givePowerCardToPlayer,
  distributeOrbitPowerCards,
  stealRandomPowerCard,
} = require('../game/roomManager');

const { evaluateWinners, playerWonWithHandType } = require('../game/wizardHandEvaluator');
const spellHandlers = require('../game/spellHandlers');

module.exports = (io, socket) => {
  socket.on('join_room', (roomCode, playerName) => {
    try {
      if (!roomExists(roomCode)) {
        createRoom(roomCode, socket.id, playerName);
        console.log(`🆕 Room created: ${roomCode} by ${playerName}`);
      } else {
        const result = joinRoom(roomCode, socket.id, playerName);
        if (result.error) {
          socket.emit('join_error', result.error);
          return;
        }
      }

      socket.join(roomCode);
      const players = getRoomPlayers(roomCode);
      io.to(roomCode).emit('room_update', players);
      console.log(`👤 ${playerName} joined room ${roomCode}`);
    } catch (error) {
      console.error('Error in join_room:', error);
      socket.emit('join_error', 'Failed to create/join room: ' + error.message);
    }
  });

  socket.on('start_game', async (roomCode) => {
    const success = await startGame(roomCode);
    if (success) {
      const room = getRoom(roomCode);
      const players = getRoomPlayers(roomCode);
      for (const player of players) {
        const hand = getPlayerHand(roomCode, player.id);
        io.to(player.id).emit('deal_hand', hand);
      }

      // Emit blind positions
      io.to(roomCode).emit('blind_positions', {
        smallBlindPlayer: room.players[room.smallBlindIndex].name,
        bigBlindPlayer: room.players[room.bigBlindIndex].name,
      });

      updateRoom(roomCode);
      sendTurnInfo(roomCode);
      console.log(`🎮 Game started in room ${roomCode}`);
    }
  });

  socket.on('call_bet', (roomCode) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.folded || player.hasActed) {
      console.log(`[call_bet] Early return: player=${player?.name}, folded=${player?.folded}, hasActed=${player?.hasActed}`);
      return;
    }

    const toCall = room.betSize - player.bet;
    console.log(`========== [call_bet] ${player.name} ==========`);
    console.log(`  room.betSize=${room.betSize}`);
    console.log(`  player.bet=${player.bet}`);
    console.log(`  toCall=${toCall}`);
    console.log(`  player.chipBalance BEFORE=${player.chipBalance}`);

    if (toCall > 0) {
      // Must call or fold
      if (player.chipBalance < toCall) {
        console.log(`  ❌ Not enough chips! Need ${toCall}, have ${player.chipBalance}`);
        socket.emit('action_error', 'Not enough chips to call.');
        return;
      }

      console.log(`  💰 Deducting ${toCall} chips for CALL`);
      player.chipBalance -= toCall;
      player.bet += toCall;
      room.pot += toCall;
    } else {
      console.log(`  ✅ CHECK allowed (toCall was 0, no chips deducted)`);
    }

    console.log(`  player.chipBalance AFTER=${player.chipBalance}`);
    console.log(`========================================`);

    player.hasActed = true;
    room.actedPlayerIds.add(player.id);

    // Broadcast updated state immediately so clients have latest bet amounts
    io.to(roomCode).emit('room_update', room.players);
    io.to(roomCode).emit('update_pot', room.pot);
    io.to(roomCode).emit('update_bet_size', room.betSize);

    if (shouldAdvanceLoop(room)) {
      advanceLoop(room, io, roomCode);
    } else {
      advanceTurn(roomCode);
    }
  });

  socket.on('raise_bet', (roomCode, newBetSize) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.folded || player.hasActed) return;

    const currentBet = player.bet;
    const callAmount = Math.max(0, room.betSize - currentBet);
    const raiseAmount = newBetSize - room.betSize;
    const totalContribution = callAmount + raiseAmount;

    if (raiseAmount <= 0 || player.chipBalance < totalContribution) {
      socket.emit('action_error', 'Invalid raise or not enough chips.');
      return;
    }

    player.chipBalance -= totalContribution;
    player.bet += totalContribution;
    room.pot += totalContribution;
    room.betSize = newBetSize;

    room.lastAggressorIndex = room.players.findIndex(p => p.id === socket.id);
    resetHasActed(room);
    player.hasActed = true;
    room.actedPlayerIds.add(player.id);

    io.to(roomCode).emit('update_bet_size', room.betSize);
    io.to(roomCode).emit('update_pot', room.pot);
    io.to(roomCode).emit('room_update', room.players);

    advanceTurn(roomCode);
  });

  socket.on('force_fold_others', (roomCode, winnerId) => {
    const room = getRoom(roomCode);
    if (!room) return;

    // For every player except winner, simulate a fold
    room.players.forEach(p => {
      if (p.id !== winnerId && !p.folded) {
        io.to(p.id).emit('force_fold', roomCode);
      }
    });
  });

  socket.on('fold', async (roomCode) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.folded) return;

    player.folded = true;
    player.hasActed = true;
    room.actedPlayerIds.add(player.id);

    io.to(roomCode).emit('player_folded', { name: player.name });

    const remaining = getActivePlayers(room);

    if (remaining.length === 1) {
      const winner = remaining[0];
      winner.chipBalance += room.pot;

      io.to(roomCode).emit('round_winner', {
        winnerName: winner.name,
        amount: room.pot,
        reason: 'All other players folded.'
      });

      room.pot = 0;
      io.to(roomCode).emit('update_pot', 0);
      io.to(roomCode).emit('room_update', room.players);

      // Start new round after delay
      setTimeout(async () => {
        const success = await startGame(roomCode);
        if (success) {
          const players = getRoomPlayers(roomCode);
          for (const p of players) {
            const hand = getPlayerHand(roomCode, p.id);
            io.to(p.id).emit('deal_hand', hand);
          }
          // Clear community cards on clients for new round:
          io.to(roomCode).emit('update_community_cards', []);

          updateRoom(roomCode);
          sendTurnInfo(roomCode);
          console.log(`🔄 New round started in room ${roomCode}`);
        }
      }, 3000);

      return;
    }

    // Continue normal turn flow if more than 1 player left
    if (shouldAdvanceLoop(room)) {
      advanceLoop(room, io, roomCode);
    } else {
      advanceTurn(roomCode);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);
    removePlayer(socket.id, io);
  });

  // ============ POKER FOR WIZARDS: POWER CARD SOCKET EVENTS ============

  /**
   * Play a spell card
   */
  socket.on('play_spell', async (roomCode, cardUniqueId, spellData) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Verify it's player's turn (if required by spell timing)
    if (spellData.requiresTurn && room.players[room.currentTurnIndex].id !== socket.id) {
      socket.emit('action_error', 'Not your turn');
      return;
    }

    const card = playPowerCard(room, socket.id, cardUniqueId);
    if (!card) {
      socket.emit('action_error', 'Card not found');
      return;
    }

    // Execute spell based on type
    let success = false;
    switch (card.id) {
      case 'yes_you':
        // Requires target player selection - just mark as played, client handles selection
        success = true;
        break;
      case 'hot_potato':
        // Requires spin - client will provide spinResult
        success = true;
        break;
      case 'call_in':
        success = spellHandlers.handleCallIn(room);
        break;
      case 'chain_reaction':
        success = spellHandlers.handleChainReaction(room);
        break;
      case 'sixth_sense':
        success = await spellHandlers.handleSixthSense(room);
        break;
      case 'reborn':
        success = await spellHandlers.handleReborn(room, socket.id);
        break;
      // Add other spells as needed
    }

    if (success) {
      io.to(roomCode).emit('spell_played', {
        playerName: player.name,
        spellName: card.name,
        cardUniqueId: cardUniqueId
      });
      
      io.to(roomCode).emit('room_update', room.players);
    } else {
      // Add card back to player's hand
      player.powerCards.push(card);
      socket.emit('action_error', 'Could not play spell');
    }
  });

  /**
   * Sell a power card for chips
   */
  socket.on('sell_power_card', (roomCode, cardUniqueId) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const sellValue = sellPowerCard(room, socket.id, cardUniqueId);
    
    if (sellValue > 0) {
      const player = room.players.find(p => p.id === socket.id);
      io.to(roomCode).emit('card_sold', {
        playerName: player.name,
        sellValue: sellValue
      });

      io.to(roomCode).emit('room_update', room.players);
    }
  });

  /**
   * Player chooses to take full pot + power card, or half pot + steal card
   */
  socket.on('choose_pot_reward', async (roomCode, choice, targetPlayerId) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (choice === 'full_pot_plus_card') {
      // Full pot + draw power card
      player.chipBalance += room.pot;
      
      if (player.powerCards.length < 4) {
        const card = drawPowerCard(room);
        if (card) {
          player.powerCards.push(card);
        }
      }
      
      io.to(roomCode).emit('reward_chosen', {
        playerName: player.name,
        choice: 'full_pot_plus_card',
        amount: room.pot
      });
    } else if (choice === 'half_pot_plus_steal') {
      // Half pot + steal random card from target
      const halfPot = Math.floor(room.pot / 2);
      player.chipBalance += halfPot;
      
      const stolenCard = stealRandomPowerCard(room, targetPlayerId, socket.id);
      
      io.to(roomCode).emit('reward_chosen', {
        playerName: player.name,
        choice: 'half_pot_plus_steal',
        amount: halfPot,
        stolenCard: stolenCard ? stolenCard.name : null
      });
    }

    room.pot = 0;
    io.to(roomCode).emit('update_pot', 0);
    io.to(roomCode).emit('room_update', room.players);

    // Start next round after 3 seconds
    setTimeout(async () => {
      const success = await startGame(roomCode);
      if (success) {
        const players = getRoomPlayers(roomCode);
        for (const p of players) {
          const hand = getPlayerHand(roomCode, p.id);
          io.to(p.id).emit('deal_hand', hand);
        }
        io.to(roomCode).emit('update_community_cards', []);
        
        const room = getRoom(roomCode);
        io.to(roomCode).emit('new_loop', room.loopNum);
        io.to(roomCode).emit('update_bet_size', room.betSize);
        io.to(roomCode).emit('game_started');
        io.to(roomCode).emit('room_update', room.players);
        io.to(roomCode).emit('update_pot', room.pot);
        
        const current = room.players[room.currentTurnIndex];
        io.to(roomCode).emit('current_turn', {
          playerId: current.id,
          playerName: current.name,
        });
        io.to(current.id).emit('your_turn');
        
        console.log(`🔄 New round started in room ${roomCode}`);
      }
    }, 3000);
  });

  function advanceTurn(roomCode) {
    const room = getRoom(roomCode);
    if (!room) return;

    const totalPlayers = room.players.length;
    let nextIndex = room.currentTurnIndex;
    let attempts = 0;

    do {
      nextIndex = (nextIndex + 1) % totalPlayers;
      attempts++;
    } while (
      (room.players[nextIndex].folded || room.players[nextIndex].chipBalance === 0) &&
      attempts < totalPlayers
    );

    room.currentTurnIndex = nextIndex;

    const activePlayers = getActivePlayers(room);
    const allMatched = activePlayers.every(p => p.bet === room.betSize);
    const isBackToAggressor = nextIndex === room.lastAggressorIndex;
    const everyoneElseActed = activePlayers.every(
      p => p.hasActed || p.id === room.players[room.lastAggressorIndex].id
    );

    if (allMatched && everyoneElseActed && isBackToAggressor) {
      sendTurnInfo(roomCode);
      setTimeout(() => advanceLoop(room, io, roomCode), 300);
    } else {
      sendTurnInfo(roomCode);
    }

    io.to(roomCode).emit('room_update', room.players);
  }

  function shouldAdvanceLoop(room) {
    const activePlayers = getActivePlayers(room);
    const allMatched = activePlayers.every(p => p.bet === room.betSize);
    const isBackToAggressor = room.currentTurnIndex === room.lastAggressorIndex;
    const aggressorHasActed = room.players[room.lastAggressorIndex]?.hasActed;

    return allMatched && isBackToAggressor && aggressorHasActed;
  }

  function resetHasActed(room) {
    room.players.forEach(p => p.hasActed = false);
  }

  function sendTurnInfo(roomCode) {
    const room = getRoom(roomCode);
    if (!room) return;

    const current = room.players[room.currentTurnIndex];
    io.to(roomCode).emit('current_turn', {
      playerId: current.id,
      playerName: current.name,
    });
    io.to(roomCode).emit('update_bet_size', room.betSize);
    io.to(current.id).emit('your_turn');
  }

  function updateRoom(roomCode) {
    const room = getRoom(roomCode);
    if (!room) return;

    io.to(roomCode).emit('new_loop', room.loopNum);
    io.to(roomCode).emit('game_started');
    io.to(roomCode).emit('room_update', room.players);
    io.to(roomCode).emit('update_pot', room.pot);
    io.to(roomCode).emit('update_bet_size', room.betSize);
  }
};
