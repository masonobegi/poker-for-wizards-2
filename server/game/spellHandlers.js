// Spell Card Handler
// Handles execution of all spell card effects

const {
  drawPowerCard,
  discardPowerCard,
  stealRandomPowerCard,
  givePowerCardToPlayer,
  playPowerCard
} = require('./roomManager');

const axios = require('axios');

/**
 * Promote or demote a card (Promotion spell)
 * Note: This is UI-mediated, server just tracks which card was affected
 */
function handlePromotion(room, playerId, targetCardCode, promoteOrDemote) {
  // 'promoteOrDemote' can be 'promote' (9->10) or 'demote' (9->8)
  // This is mostly visual, affects hand evaluation if necessary
  // For now, we track it in the card metadata
  return true;
}

/**
 * Copy Machine - copy last played spell card effect
 */
function handleCopyMachine(room, lastPlayedCard) {
  if (!lastPlayedCard || lastPlayedCard.type !== 'spell') {
    return false;
  }
  // Execute the same effect as the last played spell
  // This would recursively call the handler for that spell
  return true;
}

/**
 * Mirrored - spin to copy one community card and replace another
 * Returns the indices of which cards were copied and replaced
 */
function handleMirrored(room, spinResults) {
  // spinResults: { copyIndex: 0-5, replaceIndex: 0-5 }
  const { copyIndex, replaceIndex } = spinResults;
  
  if (copyIndex >= room.communityCards.length || replaceIndex >= room.communityCards.length) {
    return false;
  }

  const cardToCopy = room.communityCards[copyIndex];
  room.communityCards[replaceIndex] = cardToCopy;
  
  return true;
}

/**
 * Burned - spin to discard a community card
 */
function handleBurned(room, spinResult) {
  // spinResult is index 0-5 (corresponds to community card position)
  if (spinResult < 0 || spinResult >= room.communityCards.length) {
    return false;
  }

  room.communityCards.splice(spinResult, 1);
  return true;
}

/**
 * Yes, You - steal a random spell card from target player
 */
function handleYesYou(room, fromPlayerId, toPlayerId) {
  return stealRandomPowerCard(room, fromPlayerId, toPlayerId);
}

/**
 * Third Eye Blind - draw top card into hand
 */
async function handleThirdEyeBlind(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return false;

  try {
    const res = await axios.get(`https://deckofcardsapi.com/api/deck/${room.deckId}/draw/?count=1`);
    const card = res.data.cards[0];
    
    if (!player.temporaryCards) player.temporaryCards = [];
    player.temporaryCards.push(card);
    
    return card;
  } catch (err) {
    console.error('Failed to draw card for Third Eye Blind:', err.message);
    return false;
  }
}

/**
 * Reflop - replace the flop with top 3 cards
 */
async function handleReflop(room) {
  if (room.communityCards.length < 3) {
    return false; // Flop hasn't happened yet
  }

  try {
    // Draw 3 new cards
    const res = await axios.get(`https://deckofcardsapi.com/api/deck/${room.deckId}/draw/?count=3`);
    const newFlop = res.data.cards;
    
    // Replace first 3 community cards (the flop)
    room.communityCards.splice(0, 3, ...newFlop);
    
    return true;
  } catch (err) {
    console.error('Failed to reflop:', err.message);
    return false;
  }
}

/**
 * Prophecy - look at next card(s) to be revealed
 * Returns array of cards player will see
 */
async function handleProphecy(room, stage) {
  // stage can be 'flop', 'turn', 'river'
  try {
    const cardsToLook = stage === 'flop' ? 3 : 1;
    const res = await axios.get(`https://deckofcardsapi.com/api/deck/${room.deckId}/draw/?count=${cardsToLook}`);
    
    // Don't add to community cards yet, just return for player to see
    // These cards will be drawn again at the proper time
    return res.data.cards;
  } catch (err) {
    console.error('Failed to prophecy:', err.message);
    return [];
  }
}

/**
 * Hot Potato - switch hands with target player
 */
function handleHotPotato(room, player1Id, player2Id) {
  const player1 = room.players.find(p => p.id === player1Id);
  const player2 = room.players.find(p => p.id === player2Id);
  
  if (!player1 || !player2 || !room.hands[player1Id] || !room.hands[player2Id]) {
    return false;
  }

  // Swap hands
  const temp = room.hands[player1Id];
  room.hands[player1Id] = room.hands[player2Id];
  room.hands[player2Id] = temp;
  
  return true;
}

/**
 * Return/Reriver - replace turn or river with new card
 */
async function handleReturnReriver(room, replaceIndex) {
  // replaceIndex: 3 for turn (4th community card), 4 for river (5th community card)
  if (replaceIndex < 3 || replaceIndex >= room.communityCards.length) {
    return false;
  }

  try {
    const res = await axios.get(`https://deckofcardsapi.com/api/deck/${room.deckId}/draw/?count=1`);
    const newCard = res.data.cards[0];
    
    room.communityCards[replaceIndex] = newCard;
    
    return true;
  } catch (err) {
    console.error('Failed to return/reriver:', err.message);
    return false;
  }
}

/**
 * Call In - force all players to match big blind, skip to flop
 */
function handleCallIn(room) {
  // Force all non-folded players to have bet = betSize
  room.players.forEach(player => {
    if (!player.folded && player.chipBalance > 0) {
      const toCall = Math.min(room.betSize - player.bet, player.chipBalance);
      player.chipBalance -= toCall;
      player.bet += toCall;
      room.pot += toCall;
      player.hasActed = true;
    }
  });

  return true;
}

/**
 * 404 Error - disable a rank for this hand
 */
function handle404Error(room, disabledRank) {
  if (!room.disabledRanks) room.disabledRanks = [];
  room.disabledRanks.push(disabledRank);
  return true;
}

/**
 * Chain Reaction - pass hole cards left
 */
function handleChainReaction(room) {
  const playerCount = room.players.length;
  const newHands = {};

  // Save all current hands
  const allHands = {};
  room.players.forEach((player, index) => {
    allHands[index] = room.hands[player.id];
  });

  // Pass left: player 0 gets player 1's cards, player 1 gets player 2's cards, etc.
  room.players.forEach((player, index) => {
    const fromIndex = (index + 1) % playerCount;
    room.hands[player.id] = allHands[fromIndex];
  });

  return true;
}

/**
 * Change Clothes - card now counts as any suit
 * Note: This is tracked in card metadata and affects evaluation
 */
function handleChangeClothes(room, targetCardCode) {
  // Mark card as wild suit
  // This would be checked during hand evaluation
  if (!room.wildSuitCards) room.wildSuitCards = [];
  room.wildSuitCards.push(targetCardCode);
  return true;
}

/**
 * Drained - spin to select player, they flip coin
 * Returns true if selected player must pay
 */
function handleDrained(room, selectedPlayerId, coinFlipWon) {
  const selectedPlayer = room.players.find(p => p.id === selectedPlayerId);
  if (!selectedPlayer) return false;

  if (!coinFlipWon) {
    // Player loses coin flip, must pay
    const payment = Math.min(room.betSize, selectedPlayer.chipBalance);
    selectedPlayer.chipBalance -= payment;
    // Payment goes to the player who played the card
    return true;
  }

  return false;
}

/**
 * Sixth Sense - add a 6th community card
 */
async function handleSixthSense(room) {
  if (room.communityCards.length !== 5) {
    return false; // River hasn't completed yet
  }

  try {
    const res = await axios.get(`https://deckofcardsapi.com/api/deck/${room.deckId}/draw/?count=1`);
    const sixthCard = res.data.cards[0];
    
    room.communityCards.push(sixthCard);
    
    return true;
  } catch (err) {
    console.error('Failed to draw sixth sense card:', err.message);
    return false;
  }
}

/**
 * Reborn - discard hole cards and draw 2 new ones
 */
async function handleReborn(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return false;

  try {
    const res = await axios.get(`https://deckofcardsapi.com/api/deck/${room.deckId}/draw/?count=2`);
    const newCards = res.data.cards;
    
    room.hands[playerId] = newCards;
    
    return true;
  } catch (err) {
    console.error('Failed to reborn:', err.message);
    return false;
  }
}

/**
 * Show Me - draw ranks from bag, all players reveal that rank
 */
function handleShowMe(room, selectedRank) {
  // Track that this rank must be revealed
  if (!room.forcedRevealRanks) room.forcedRevealRanks = [];
  room.forcedRevealRanks.push(selectedRank);
  return true;
}

/**
 * Wild Style - all cards of a rank are wild
 */
function handleWildStyle(room, selectedRank) {
  if (!room.wildRanks) room.wildRanks = [];
  room.wildRanks.push(selectedRank);
  return true;
}

/**
 * Veto - cancel the last played spell
 */
function handleVeto(room, cancelledSpellId) {
  // Remove the effect of the previously played spell
  // This is handled at a higher level in the socket handlers
  return true;
}

module.exports = {
  handlePromotion,
  handleCopyMachine,
  handleMirrored,
  handleBurned,
  handleYesYou,
  handleThirdEyeBlind,
  handleReflop,
  handleProphecy,
  handleHotPotato,
  handleReturnReriver,
  handleCallIn,
  handle404Error,
  handleChainReaction,
  handleChangeClothes,
  handleDrained,
  handleSixthSense,
  handleReborn,
  handleShowMe,
  handleWildStyle,
  handleVeto
};
