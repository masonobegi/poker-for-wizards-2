const axios = require('axios');
const { createPowerCardDeck, shuffleArray } = require('./powerCards');

const rooms = {};

function createRoom(roomCode, hostId, hostName) {
  try {
    const deck = createPowerCardDeck();
    console.log(`Created power card deck with ${deck.length} cards`);
    
    rooms[roomCode] = {
    players: [{
      id: hostId,
      name: hostName,
      isHost: true,
      chipBalance: 50000, // 50 big blinds * 1000 chip big blind
      folded: false,
      bet: 0,
      hasActed: false,
      powerCards: [], // Poker for Wizards: Player's power cards (max 4)
      activePowerCards: [], // Enchantments/bounties currently in play
    }],
    gameStarted: false,
    deckId: null,
    hands: {},
    dealerIndex: 0,
    pot: 0,
    betSize: 1000, // 1k chips as big blind
    currentTurnIndex: 0,
    waitingForInitialCalls: true,
    loopNum: 0,
    actedPlayerIds: new Set(),
    communityCards: [],
    lastAggressorIndex: null,
    // Poker for Wizards additions
    powerCardDeck: deck, // Initialize power card deck
    discardedPowerCards: [],
    orbitCount: 0, // Track complete orbits for power card distribution
    activeEnchantments: [], // Currently active enchantments affecting hand ranking
    smallBlind: 500, // Half of big blind
  };
  } catch (error) {
    console.error(`Error creating room ${roomCode}:`, error);
    throw error;
  }
}

function joinRoom(roomCode, playerId, playerName) {
  const room = rooms[roomCode];
  if (!room) return { error: 'Room does not exist' };
  if (room.gameStarted) return { error: 'Game already started in this room' };

  const alreadyInRoom = room.players.some(p => p.id === playerId);
  if (!alreadyInRoom) {
    room.players.push({
      id: playerId,
      name: playerName,
      isHost: false,
      chipBalance: 50000, // 50 big blinds
      folded: false,
      bet: 0,
      hasActed: false,
      powerCards: [], // Poker for Wizards: Player's power cards (max 4)
      activePowerCards: [], // Enchantments/bounties currently in play
    });
  }

  return {};
}

async function startGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return false;

  try {
    const res = await axios.get('https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1');
    const deckId = res.data.deck_id;
    room.deckId = deckId;

    const count = room.players.length * 2;
    const drawRes = await axios.get(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=${count}`);
    const cards = drawRes.data.cards;

    room.hands = {};
    room.players.forEach((player, index) => {
      room.hands[player.id] = [cards[index * 2], cards[index * 2 + 1]];
      player.bet = 0;
      player.folded = false;
      player.hasActed = false;
      
      // Poker for Wizards: Each player starts with Veto card
      player.powerCards = [{
        id: 'veto',
        name: 'Veto',
        type: 'spell',
        uniqueId: 'starting_veto_' + player.id,
        timeTrigger: 'AFTER_ANY_SPELL',
        sellValue: 2,
        description: 'Cancel out the last played spell card'
      }];
      
      // Draw one random power card for each player
      if (room.powerCardDeck.length > 0) {
        const randomCard = room.powerCardDeck.pop();
        player.powerCards.push(randomCard);
      }
    });

    room.gameStarted = true;
    room.waitingForInitialCalls = true;
    
    // TEXAS HOLD'EM: Set up blind positions
    // Dealer is index 0
    // Small blind is index 1 (dealer + 1, or index 0 in 2-player)
    // Big blind is index 2 (dealer + 2, or index 1 in 2-player)
    // First to act is index 3 (or index 0 in 2-player, index 2 in 3-player)
    
    const playerCount = room.players.length;
    room.dealerIndex = 0;
    room.smallBlindIndex = playerCount === 2 ? 0 : 1;
    room.bigBlindIndex = playerCount === 2 ? 1 : 2;
    
    // Auto-post blinds
    const smallBlindPlayer = room.players[room.smallBlindIndex];
    const bigBlindPlayer = room.players[room.bigBlindIndex];
    
    const SMALL_BLIND = 500;
    const BIG_BLIND = 1000;
    
    smallBlindPlayer.chipBalance -= SMALL_BLIND;
    smallBlindPlayer.bet = SMALL_BLIND;
    
    bigBlindPlayer.chipBalance -= BIG_BLIND;
    bigBlindPlayer.bet = BIG_BLIND;
    
    room.pot = SMALL_BLIND + BIG_BLIND;
    room.betSize = BIG_BLIND;
    room.smallBlind = SMALL_BLIND;
    
    // First to act is after big blind
    if (playerCount === 2) {
      room.currentTurnIndex = 0; // In heads-up, dealer acts first pre-flop
    } else {
      room.currentTurnIndex = (room.bigBlindIndex + 1) % playerCount;
    }
    
    room.lastAggressorIndex = room.bigBlindIndex;
    room.loopNum = 0;
    room.actedPlayerIds = new Set();
    room.communityCards = [];
    room.orbitCount = 0;

    console.log(`🎰 TEXAS HOLD'EM BLINDS POSTED:`);
    console.log(`  Dealer: ${room.players[room.dealerIndex].name}`);
    console.log(`  Small Blind (${SMALL_BLIND}): ${smallBlindPlayer.name}`);
    console.log(`  Big Blind (${BIG_BLIND}): ${bigBlindPlayer.name}`);
    console.log(`  First to Act: ${room.players[room.currentTurnIndex].name}`);

    return true;
  } catch (err) {
    console.error('Failed to start game:', err.message);
    return false;
  }
}

function getPlayerHand(roomCode, playerId) {
  return rooms[roomCode]?.hands?.[playerId] || [];
}

function getRoomPlayers(roomCode) {
  return rooms[roomCode]?.players || [];
}

function roomExists(roomCode) {
  return Boolean(rooms[roomCode]);
}

function getRoom(roomCode) {
  return rooms[roomCode];
}

function removePlayer(socketId, io) {
  for (const roomCode in rooms) {
    const room = rooms[roomCode];
    const wasHost = room.players.find(p => p.id === socketId && p.isHost);
    const wasInRoom = room.players.some(p => p.id === socketId);
    if (!wasInRoom) continue;

    room.players = room.players.filter(p => p.id !== socketId);
    delete room.hands?.[socketId];

    io.to(roomCode).emit('room_update', room.players);

    if (wasHost) {
      io.to(roomCode).emit('host_disconnected');
      setTimeout(() => {
        io.to(roomCode).emit('game_ended');
        delete rooms[roomCode];
        console.log(`🛑 Room ${roomCode} closed due to host leaving`);
      }, 5000);
    }

    if (room.players.length === 0) {
      delete rooms[roomCode];
      console.log(`🗑️ Room ${roomCode} deleted (all players left)`);
    }

    break;
  }
}

function getActivePlayers(room) {
  return room.players.filter(p => !p.folded);
}

function haveAllActed(room) {
  const activeIds = getActivePlayers(room).map(p => p.id);
  return activeIds.every(id => room.actedPlayerIds.has(id));
}

async function advanceLoop(room, io, roomCode) {
  room.loopNum += 1;
  room.actedPlayerIds = new Set();

  // Reset bets for new round
  room.players.forEach(p => {
    p.bet = 0;
    p.hasActed = false;
  });

  // Post blinds again for new round
  const playerCount = room.players.length;
  
  // Move dealer button
  room.dealerIndex = (room.dealerIndex + 1) % playerCount;
  room.smallBlindIndex = playerCount === 2 ? room.dealerIndex : (room.dealerIndex + 1) % playerCount;
  room.bigBlindIndex = playerCount === 2 ? (room.dealerIndex + 1) % playerCount : (room.dealerIndex + 2) % playerCount;
  
  const SMALL_BLIND = 500;
  const BIG_BLIND = 1000;
  
  const smallBlindPlayer = room.players[room.smallBlindIndex];
  const bigBlindPlayer = room.players[room.bigBlindIndex];
  
  smallBlindPlayer.chipBalance -= SMALL_BLIND;
  smallBlindPlayer.bet = SMALL_BLIND;
  
  bigBlindPlayer.chipBalance -= BIG_BLIND;
  bigBlindPlayer.bet = BIG_BLIND;
  
  room.pot += SMALL_BLIND + BIG_BLIND;
  room.betSize = BIG_BLIND;
  room.lastAggressorIndex = room.bigBlindIndex;
  
  // First to act is after big blind
  if (playerCount === 2) {
    room.currentTurnIndex = room.dealerIndex;
  } else {
    room.currentTurnIndex = (room.bigBlindIndex + 1) % playerCount;
  }

  await revealCommunityCards(room);

  io.to(roomCode).emit('new_loop', room.loopNum);
  io.to(roomCode).emit('update_bet_size', room.betSize);
  io.to(roomCode).emit('update_pot', room.pot);
  io.to(roomCode).emit('update_community_cards', room.communityCards);

  if (room.loopNum >= 4) {
    io.to(roomCode).emit('showdown', {
      communityCards: room.communityCards,
      hands: room.hands,
      players: room.players,
      potAmount: room.pot,
    });
  }
}

function handlePlayerDisconnect(socketId) {
  for (const roomCode in rooms) {
    const room = rooms[roomCode];
    room.players = room.players.filter(p => p.id !== socketId);
    delete room.hands?.[socketId];

    if (room.players.length === 0) {
      delete rooms[roomCode];
      console.log(`🫥 All players disconnected from room ${roomCode}. Game ended.`);
    }
  }
}

async function revealCommunityCards(room) {
  const { loopNum, deckId } = room;

  if (loopNum === 1) {
    const flop = await drawCards(deckId, 3);
    room.communityCards.push(...flop);
  } else if (loopNum === 2 || loopNum === 3) {
    const single = await drawCards(deckId, 1);
    if (single.length) room.communityCards.push(single[0]);
  }
}

async function drawCards(deckId, count) {
  try {
    const res = await axios.get(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=${count}`);
    return res.data.cards;
  } catch (err) {
    console.error(`Failed to draw ${count} cards:`, err.message);
    return [];
  }
}

// ============ POKER FOR WIZARDS: POWER CARD FUNCTIONS ============

// Draw a power card from the deck (reshuffle discards if deck is empty)
function drawPowerCard(room) {
  if (room.powerCardDeck.length === 0) {
    // Reshuffle all discarded cards back into deck
    room.powerCardDeck = shuffleArray([...room.discardedPowerCards]);
    room.discardedPowerCards = [];
  }
  return room.powerCardDeck.pop();
}

// Discard a power card from a player
function discardPowerCard(room, playerId, cardUniqueId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return false;

  const cardIndex = player.powerCards.findIndex(c => c.uniqueId === cardUniqueId);
  if (cardIndex === -1) return false;

  const card = player.powerCards.splice(cardIndex, 1)[0];
  room.discardedPowerCards.push(card);
  return true;
}

// Play a power card (remove from hand and add to active if it's an enchantment/bounty)
function playPowerCard(room, playerId, cardUniqueId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;

  const cardIndex = player.powerCards.findIndex(c => c.uniqueId === cardUniqueId);
  if (cardIndex === -1) return null;

  const card = player.powerCards.splice(cardIndex, 1)[0];
  return card;
}

// Sell a power card for its value
function sellPowerCard(room, playerId, cardUniqueId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return 0;

  const cardIndex = player.powerCards.findIndex(c => c.uniqueId === cardUniqueId);
  if (cardIndex === -1) return 0;

  const card = player.powerCards.splice(cardIndex, 1)[0];
  const sellValue = Math.floor(card.sellValue * room.betSize);
  player.chipBalance += sellValue;
  room.discardedPowerCards.push(card);
  
  return sellValue;
}

// Give player a power card (handles max 4 card limit)
function givePowerCardToPlayer(room, playerId, card) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return false;

  // If player already has 4 cards, must sell one first
  if (player.powerCards.length >= 4) {
    return false; // Client should handle forcing player to sell
  }

  player.powerCards.push(card);
  return true;
}

// Distribute power cards after each orbit (dealer button makes full rotation)
function distributeOrbitPowerCards(room) {
  const playerCount = room.players.length;
  
  // Clockwise starting from dealer
  for (let i = 0; i < playerCount; i++) {
    const playerIndex = (room.dealerIndex + i) % playerCount;
    const player = room.players[playerIndex];
    
    const card = drawPowerCard(room);
    if (card && player.powerCards.length < 4) {
      player.powerCards.push(card);
    }
  }
  
  room.orbitCount++;
}

// Steal a random power card from target player
function stealRandomPowerCard(room, fromPlayerId, toPlayerId) {
  const fromPlayer = room.players.find(p => p.id === fromPlayerId);
  const toPlayer = room.players.find(p => p.id === toPlayerId);
  
  if (!fromPlayer || !toPlayer || fromPlayer.powerCards.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * fromPlayer.powerCards.length);
  const stolenCard = fromPlayer.powerCards.splice(randomIndex, 1)[0];
  
  if (toPlayer.powerCards.length < 4) {
    toPlayer.powerCards.push(stolenCard);
    return stolenCard;
  } else {
    // Player receiving card already at max, card goes to discard
    room.discardedPowerCards.push(stolenCard);
    return null;
  }
}

// ============ HAND EVALUATION ============

// Simple hand ranking for determining winner
// Uses pokersolver under the hood
function rankPlayerHands(players, hands, communityCards) {
  const { Hand } = require('pokersolver');
  
  const handsWithRanks = players
    .filter(p => !p.folded && hands[p.id])
    .map(player => {
      try {
        const playerCards = (hands[player.id] || []).map(c => {
          // Convert card format from API to pokersolver format
          let rank = c.value === '0' ? '10' : c.value;
          let suit = c.suit.charAt(0).toUpperCase();
          return rank + suit;
        });

        const communityCardsCodes = communityCards.map(c => {
          let rank = c.value === '0' ? '10' : c.value;
          let suit = c.suit.charAt(0).toUpperCase();
          return rank + suit;
        });

        const allCards = [...playerCards, ...communityCardsCodes];
        const solvedHand = Hand.solve(allCards);

        return {
          playerId: player.id,
          name: player.name,
          hand: solvedHand,
          rankValue: getHandRankValue(solvedHand.name)
        };
      } catch (err) {
        console.error(`Error evaluating hand for ${player.name}:`, err.message);
        return {
          playerId: player.id,
          name: player.name,
          hand: null,
          rankValue: -1
        };
      }
    });

  // Find winners (highest rank)
  const maxRank = Math.max(...handsWithRanks.map(h => h.rankValue));
  const winners = handsWithRanks.filter(h => h.rankValue === maxRank);

  return {
    evaluated: handsWithRanks,
    winners: winners,
    allPlayers: handsWithRanks
  };
}

function getHandRankValue(handName) {
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
  return ranks[handName] || 0;
}

module.exports = {
  createRoom,
  joinRoom,
  startGame,
  getPlayerHand,
  getRoomPlayers,
  roomExists,
  getRoom,
  removePlayer,
  getActivePlayers,
  haveAllActed,
  advanceLoop,
  handlePlayerDisconnect,
  rankPlayerHands,
  // Power card functions
  drawPowerCard,
  discardPowerCard,
  playPowerCard,
  sellPowerCard,
  givePowerCardToPlayer,
  distributeOrbitPowerCards,
  stealRandomPowerCard,
};
