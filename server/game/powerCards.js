// Poker for Wizards Power Cards Database
// Cards are categorized as: Spells, Enchantments, Bounties

const powerCards = {
  spells: [
    {
      id: 'promotion',
      name: 'Promotion',
      quantity: 1,
      timeTrigger: 'ANYTIME',
      sellValue: 1,
      description: 'Use a binder clip to attach this card to the card you want to promote or demote. Use one binder clip to indicate a promotion (9 to 10) or two binder clips to indicate a demotion (9 to 8)'
    },
    {
      id: 'copy_machine',
      name: 'Copy Machine',
      quantity: 1,
      timeTrigger: 'AFTER_ANY_SPELL',
      sellValue: 2,
      description: 'Play this card to copy the effects of the last played spell card'
    },
    {
      id: 'mirrored',
      name: 'Mirrored',
      quantity: 1,
      timeTrigger: 'AFTER_FLOP_BEFORE_ACTION',
      sellValue: 1,
      description: 'Spin the spinner with 1-2 being the first community card, 3-4 being the second and 5-6 being the third, the first spin designates which card is to be copied and the second spin will designate which card will be replaced, place this card under the copied card'
    },
    {
      id: 'burned',
      name: 'Burned',
      quantity: 1,
      timeTrigger: 'ANYTIME_AFTER_FLOP',
      sellValue: 1,
      description: 'Spin the spinner with 1 being the first community card, 2 being the second and so on, discard the corresponding card to the number spun, if there is no corresponding card, do nothing'
    },
    {
      id: 'yes_you',
      name: 'Yes, You',
      quantity: 1,
      timeTrigger: 'ANYTIME',
      sellValue: 2,
      description: 'Steal a random spell card from a player of your choice'
    },
    {
      id: 'third_eye_blind',
      name: 'Third Eye Blind',
      quantity: 2,
      timeTrigger: 'ANYTIME',
      sellValue: 2,
      description: 'Draw the top card of the deck into your hand for this hand'
    },
    {
      id: 'reflop',
      name: 'Reflop',
      quantity: 2,
      timeTrigger: 'AFTER_FLOP_BEFORE_POST_FLOP_ACTION',
      sellValue: 1,
      description: 'Replace the flop with the top 3 cards of the deck, discard the original flop'
    },
    {
      id: 'prophecy',
      name: 'Prophecy',
      quantity: 2,
      timeTrigger: 'BEFORE_FLOP_TURN_RIVER',
      sellValue: 1,
      description: 'Look at the next card/cards about to be turned over (either flop or turn or river)'
    },
    {
      id: 'hot_potato',
      name: 'Hot Potato',
      quantity: 2,
      timeTrigger: 'ANYTIME_BEFORE_PRE_FLOP_ACTION',
      sellValue: 1,
      description: 'Spin the spinner to target a player and switch hands with them, if the pencil lands on you, respin'
    },
    {
      id: 'return_reriver',
      name: 'Return/Reriver',
      quantity: 2,
      timeTrigger: 'AFTER_FLOP_OR_RIVER',
      sellValue: 1,
      description: 'This card can either be played after the turn OR after the river to replace that card, discard the original turn/river'
    },
    {
      id: 'call_in',
      name: 'Call In',
      quantity: 2,
      timeTrigger: 'BEFORE_PRE_FLOP_ACTION',
      sellValue: 1,
      description: 'This card forces all players to call before any pre-flop action has started, immediately do the flop'
    },
    {
      id: '404_error',
      name: '404 Error',
      quantity: 2,
      timeTrigger: 'ANYTIME',
      sellValue: 1,
      description: 'Choose 2 random ranks out of the rank bag and choose 1 of the 2, that rank is no longer allowed in ANY poker hands'
    },
    {
      id: 'chain_reaction',
      name: 'Chain Reaction',
      quantity: 2,
      timeTrigger: 'ANYTIME',
      sellValue: 1,
      description: 'Every player passes one of their hole cards to the left'
    },
    {
      id: 'change_clothes',
      name: 'Change Clothes',
      quantity: 2,
      timeTrigger: 'ANYTIME',
      sellValue: 1,
      description: 'Use a binder clip to attach this card to the card you want to affect, that card now counts as any suit'
    },
    {
      id: 'drained',
      name: 'Drained',
      quantity: 2,
      timeTrigger: 'BEFORE_DEAL',
      sellValue: 0.5,
      description: 'Spin the spinner to designate a player, that player must flip a coin, if it lands on the side they choose, no effect, if not, they pay you 1 big blind'
    },
    {
      id: 'sixth_sense',
      name: 'Sixth Sense',
      quantity: 2,
      timeTrigger: 'AFTER_RIVER_BEFORE_ACTION',
      sellValue: 1,
      description: 'Draw a sixth community card'
    },
    {
      id: 'reborn',
      name: 'Reborn',
      quantity: 2,
      timeTrigger: 'AFTER_FLOP_BEFORE_POST_FLOP_ACTION',
      sellValue: 1,
      description: 'Discard both of your hole cards and take 2 new ones from the top of the deck'
    },
    {
      id: 'show_me',
      name: 'Show Me',
      quantity: 2,
      timeTrigger: 'ANYTIME',
      sellValue: 1,
      description: 'Draw 2 ranks from the rank bag, choose 1 of the 2 ranks and all players must place their card of that rank face up in front of them'
    },
    {
      id: 'wild_style',
      name: 'Wild Style',
      quantity: 2,
      timeTrigger: 'ANYTIME',
      sellValue: 1,
      description: 'Draw 2 ranks from the rank bag, choose 1 of the 2 ranks, all cards of that rank are wild for this hand'
    },
    {
      id: 'veto',
      name: 'Veto',
      quantity: 9,
      timeTrigger: 'AFTER_ANY_SPELL',
      sellValue: 2,
      description: 'Cancel out the last played spell card'
    }
  ],

  enchantments: [
    {
      id: 'blurred',
      name: 'Blurred',
      quantity: 1,
      timeTrigger: 'ANYTIME_BEFORE_PRE_FLOP_ACTION',
      sellValue: 1,
      description: 'Hearts and Diamonds are now considered the same suit, Spades and Clubs are now considered the same suit'
    },
    {
      id: 'push_through',
      name: 'Push Through',
      quantity: 1,
      timeTrigger: 'ANYTIME_BEFORE_PRE_FLOP_ACTION',
      sellValue: 1,
      description: 'Aces may now be high and low in a straight (Ex. Q K A 2 3 is a valid straight)'
    },
    {
      id: 'king_me',
      name: 'King Me',
      quantity: 1,
      timeTrigger: 'ANYTIME_BEFORE_PRE_FLOP_ACTION',
      sellValue: 1,
      description: 'All face cards MAY be considered Kings'
    },
    {
      id: 'reverse_reverse_reverse',
      name: 'Reverse Reverse REVERSE REVERSE',
      quantity: 1,
      timeTrigger: 'ANYTIME_BEFORE_PRE_FLOP_ACTION',
      sellValue: 1,
      description: 'The lowest hand this round is the winner'
    },
    {
      id: 'thats_odd',
      name: "That's Odd",
      quantity: 1,
      timeTrigger: 'ANYTIME_BEFORE_PRE_FLOP_ACTION',
      sellValue: 1,
      description: 'Even numbered cards are all disabled this hand (2,4,6,8,10)'
    }
  ],

  bounties: [
    {
      id: 'royalty',
      name: 'Royalty',
      quantity: 1,
      timeTrigger: 'AFTER_HAND',
      sellValue: 1,
      description: 'If you win with a Royal Flush take 5 big blinds from the bank'
    },
    {
      id: 'in_the_shadows',
      name: 'In the Shadows',
      quantity: 1,
      timeTrigger: 'AFTER_HAND',
      sellValue: 0.5,
      description: 'If you win with only Spades and Clubs take one big blind from the player that got second place in the hand'
    },
    {
      id: 'lucky_7',
      name: 'Lucky 7',
      quantity: 2,
      timeTrigger: 'AFTER_HAND',
      sellValue: 0.5,
      description: 'If you win with a 7 in your scoring hand, take ½ big blind from everybody'
    },
    {
      id: 'straight_up',
      name: 'Straight Up',
      quantity: 2,
      timeTrigger: 'AFTER_HAND',
      sellValue: 0.5,
      description: 'If you win with a straight, take 1 big blind from the bank'
    },
    {
      id: 'underdog',
      name: 'Underdog',
      quantity: 2,
      timeTrigger: 'AFTER_HAND',
      sellValue: 0.5,
      description: 'If you win with High Card, take 2 big blinds from the bank'
    }
  ]
};

// Create a flat deck of all power cards with their quantities
function createPowerCardDeck() {
  const deck = [];
  
  // Add spells
  powerCards.spells.forEach(card => {
    for (let i = 0; i < card.quantity; i++) {
      deck.push({
        ...card,
        uniqueId: `spell_${card.id}_${i}`,
        type: 'spell'
      });
    }
  });

  // Add enchantments
  powerCards.enchantments.forEach(card => {
    for (let i = 0; i < card.quantity; i++) {
      deck.push({
        ...card,
        uniqueId: `enchantment_${card.id}_${i}`,
        type: 'enchantment'
      });
    }
  });

  // Add bounties
  powerCards.bounties.forEach(card => {
    for (let i = 0; i < card.quantity; i++) {
      deck.push({
        ...card,
        uniqueId: `bounty_${card.id}_${i}`,
        type: 'bounty'
      });
    }
  });

  // Shuffle deck
  return shuffleArray(deck);
}

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

module.exports = {
  powerCards,
  createPowerCardDeck,
  shuffleArray
};
