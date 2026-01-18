// Poker for Wizards Extended Hand Evaluator
// Supports standard poker hands + custom Wizard hands
// Handles enchantments that modify hand evaluation

const { Hand } = require('pokersolver');

// Card rank values for comparison (Ace can be 1 or 14)
const rankValues = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const suitMap = {
  'D': 'diamonds',
  'H': 'hearts',
  'C': 'clubs',
  'S': 'spades'
};

/**
 * Apply enchantments to modify hand evaluation
 */
function applyEnchantments(cards, enchantments) {
  let modifiedCards = [...cards];

  enchantments.forEach(ench => {
    switch (ench.id) {
      case 'blurred':
        // Hearts and Diamonds are same suit, Spades and Clubs are same suit
        modifiedCards = modifiedCards.map(card => {
          const suit = card[card.length - 1];
          if (suit === 'D') return card.slice(0, -1) + 'H'; // Diamonds become Hearts
          if (suit === 'C') return card.slice(0, -1) + 'S'; // Clubs become Spades
          return card;
        });
        break;

      case 'king_me':
        // All face cards can be considered Kings
        modifiedCards = modifiedCards.map(card => {
          const rank = card.slice(0, -1);
          if (['J', 'Q', 'K'].includes(rank)) return 'K' + card[card.length - 1];
          return card;
        });
        break;

      case 'thats_odd':
        // Even numbered cards are disabled (2,4,6,8,10) - remove them
        modifiedCards = modifiedCards.filter(card => {
          const rank = card.slice(0, -1);
          return !['2', '4', '6', '8', '10'].includes(rank);
        });
        break;

      case 'push_through':
        // This is handled in straight detection
        break;
    }
  });

  return modifiedCards;
}

/**
 * Check for five of a kind (all 5 cards same rank)
 */
function checkFiveOfAKind(cards) {
  if (cards.length !== 5) return null;
  
  const ranks = cards.map(c => c.slice(0, -1));
  if (new Set(ranks).size === 1) {
    return {
      name: 'Five of a Kind',
      rank: 9.5, // Higher than royal flush
      descr: `Five of a Kind - ${ranks[0]}'s`,
      cards: cards
    };
  }
  return null;
}

/**
 * Check for flush five (five of any rank all same suit)
 */
function checkFlushFive(cards) {
  if (cards.length !== 5) return null;
  
  const suits = cards.map(c => c[c.length - 1]);
  const ranks = cards.map(c => c.slice(0, -1));
  
  if (new Set(suits).size === 1 && new Set(ranks).size === 1) {
    return {
      name: 'Flush Five',
      rank: 9.7, // Highest hand
      descr: `Flush Five - ${ranks[0]}'s of ${suitMap[suits[0]]}`,
      cards: cards
    };
  }
  return null;
}

/**
 * Check for flush house (full house + flush in one hand)
 */
function checkFlushHouse(cards) {
  if (cards.length !== 5) return null;

  const suits = cards.map(c => c[c.length - 1]);
  const ranks = cards.map(c => c.slice(0, -1));
  
  // Must be all same suit
  if (new Set(suits).size !== 1) return null;
  
  // Must be full house pattern (3 of one rank, 2 of another)
  const rankCounts = {};
  ranks.forEach(rank => {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });
  
  const counts = Object.values(rankCounts).sort().reverse();
  if (counts[0] === 3 && counts[1] === 2) {
    const threeRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
    const twoRank = Object.keys(rankCounts).find(r => rankCounts[r] === 2);
    
    return {
      name: 'Flush House',
      rank: 9.6, // Between flush five and royal flush
      descr: `Flush House - ${threeRank}'s full of ${twoRank}'s in ${suitMap[suits[0]]}`,
      cards: cards
    };
  }
  
  return null;
}

/**
 * Evaluate best 5-card hand from 7 available cards
 * Supports Poker for Wizards custom hands and enchantments
 */
function evaluateHand(sevenCards, enchantments = []) {
  // Apply enchantments first
  const adjustedCards = applyEnchantments(sevenCards, enchantments);
  
  if (adjustedCards.length < 5) {
    // Not enough cards due to enchantments
    return null;
  }

  // Generate all 5-card combinations from 7 cards
  const combinations = generateCombinations(adjustedCards, 5);
  let bestHand = null;
  let bestRank = -1;

  combinations.forEach(combo => {
    // Check Poker for Wizards custom hands first (higher precedence)
    let hand = checkFlushFive(combo);
    if (hand) {
      if (!bestHand || hand.rank > bestRank) {
        bestHand = hand;
        bestRank = hand.rank;
      }
      return;
    }

    hand = checkFiveOfAKind(combo);
    if (hand) {
      if (!bestHand || hand.rank > bestRank) {
        bestHand = hand;
        bestRank = hand.rank;
      }
      return;
    }

    hand = checkFlushHouse(combo);
    if (hand) {
      if (!bestHand || hand.rank > bestRank) {
        bestHand = hand;
        bestRank = hand.rank;
      }
      return;
    }

    // Fall back to standard poker hand evaluation
    try {
      const standardHand = Hand.solve(combo);
      const handRank = getStandardHandRank(standardHand.name);
      
      if (!bestHand || handRank > bestRank) {
        bestHand = standardHand;
        bestRank = handRank;
      }
    } catch (e) {
      // Invalid hand combination
    }
  });

  return bestHand;
}

/**
 * Get numeric rank for standard poker hands for comparison
 */
function getStandardHandRank(handName) {
  const ranks = {
    'Straight Flush': 8,
    'Four of a Kind': 7,
    'Full House': 6,
    'Flush': 5,
    'Straight': 4,
    'Three of a Kind': 3,
    'Two Pair': 2,
    'Pair': 1,
    'High Card': 0
  };
  return ranks[handName] || 0;
}

/**
 * Generate all k-combinations from array
 */
function generateCombinations(array, k) {
  if (k === 1) return array.map(item => [item]);
  
  const combinations = [];
  for (let i = 0; i <= array.length - k; i++) {
    const head = array[i];
    const tailCombinations = generateCombinations(array.slice(i + 1), k - 1);
    tailCombinations.forEach(tail => {
      combinations.push([head, ...tail]);
    });
  }
  return combinations;
}

/**
 * Evaluate all players' hands and determine winner(s)
 * @param {Array} players - Array of players with their cards
 * @param {Array} enchantments - Active enchantments affecting hand evaluation
 * @param {Boolean} lowHandWins - If true, lowest hand wins (Reverse Reverse REVERSE)
 */
function evaluateWinners(players, enchantments = [], lowHandWins = false) {
  const evaluatedHands = players.map(player => {
    const hand = evaluateHand(player.cards, enchantments);
    
    return {
      playerId: player.id,
      name: player.name,
      hand: hand,
      rank: getHandComparativeRank(hand)
    };
  });

  // Determine winners
  if (lowHandWins) {
    // Lowest hand wins (Reverse Reverse REVERSE enchantment)
    const minRank = Math.min(...evaluatedHands.map(h => h.rank));
    const winners = evaluatedHands.filter(h => h.rank === minRank);
    
    return evaluatedHands.map(h => ({
      ...h,
      isWinner: winners.includes(h)
    }));
  } else {
    // Highest hand wins (standard)
    const maxRank = Math.max(...evaluatedHands.map(h => h.rank));
    const winners = evaluatedHands.filter(h => h.rank === maxRank);
    
    return evaluatedHands.map(h => ({
      ...h,
      isWinner: winners.includes(h)
    }));
  }
}

/**
 * Get numeric value for hand ranking comparison
 */
function getHandComparativeRank(hand) {
  if (!hand) return -1;

  // Check for Poker for Wizards custom hands
  if (hand.name === 'Flush Five') return 10;
  if (hand.name === 'Flush House') return 9.9;
  if (hand.name === 'Five of a Kind') return 9.8;

  // Standard hands
  const standardRanks = {
    'Straight Flush': 8.5,
    'Four of a Kind': 7.5,
    'Full House': 6.5,
    'Flush': 5.5,
    'Straight': 4.5,
    'Three of a Kind': 3.5,
    'Two Pair': 2.5,
    'Pair': 1.5,
    'High Card': 0.5
  };

  return standardRanks[hand.name] || 0;
}

/**
 * Check if player won with specific hand type (for bounties)
 */
function playerWonWithHandType(hand, handType) {
  if (!hand) return false;

  const handName = hand.name || '';

  switch (handType) {
    case 'royalFlush':
      return handName === 'Straight Flush' && hasRoyalCards(hand.cards);
    case 'straight':
      return handName === 'Straight';
    case 'highCard':
      return handName === 'High Card';
    case 'sevenInHand':
      return hand.cards && hand.cards.some(card => card.startsWith('7'));
    case 'shadowsSuit':
      // Only Spades and Clubs
      return hand.cards && hand.cards.every(card => ['S', 'C'].includes(card[card.length - 1]));
    default:
      return false;
  }
}

/**
 * Check if hand contains royal flush cards (10, J, Q, K, A)
 */
function hasRoyalCards(cards) {
  if (!cards || cards.length < 5) return false;
  const ranks = cards.map(c => c.slice(0, -1));
  const royalRanks = ['10', 'J', 'Q', 'K', 'A'];
  return ranks.every(r => royalRanks.includes(r));
}

module.exports = {
  evaluateHand,
  evaluateWinners,
  playerWonWithHandType,
  applyEnchantments,
  checkFiveOfAKind,
  checkFlushFive,
  checkFlushHouse,
  getHandComparativeRank
};
