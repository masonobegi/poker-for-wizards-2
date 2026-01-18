# Poker for Wizards - Implementation Guide

## Overview
This document outlines the complete implementation of the **Poker for Wizards** ruleset in the multiplayer poker game.

## Files Created/Modified

### New Server Files

#### 1. `server/game/powerCards.js`
Defines all power cards in the game:
- **Spells** (19 cards): Direct game-altering effects
- **Enchantments** (5 cards): Modify hand ranking rules
- **Bounties** (5 cards): Reward bonus chips for specific hand wins

Key exports:
- `powerCards` - Card database
- `createPowerCardDeck()` - Create shuffled deck of all power cards
- `shuffleArray()` - Fisher-Yates shuffle algorithm

#### 2. `server/game/wizardHandEvaluator.js`
Extended hand evaluation supporting Poker for Wizards rules:

**New Hand Rankings** (highest to lowest):
1. **Flush Five** - 5 cards of same rank, all same suit (highest)
2. **Flush House** - Full house (3 of a kind + 2 of a kind) + all same suit
3. **Five of a Kind** - All 5 cards same rank
4. Standard poker hands (Straight Flush, Four of a Kind, etc.)
5. **High Card** (lowest)

**Enchantment Effects**:
- `blurred` - Hearts/Diamonds = same suit, Spades/Clubs = same suit
- `push_through` - Aces can be low or high in straights (A-2-3-4-5 or Q-K-A-2-3)
- `king_me` - All face cards can be treated as Kings
- `reverse_reverse_reverse` - Lowest hand wins instead of highest
- `thats_odd` - All even numbered cards (2,4,6,8,10) are disabled

Key exports:
- `evaluateWinners()` - Evaluate all players' hands
- `playerWonWithHandType()` - Check for bounty conditions
- `applyEnchantments()` - Apply active enchantments to card evaluation

#### 3. `server/game/spellHandlers.js`
Handles execution of all spell card effects:

**Spell Functions**:
- `handlePromotion()` - Promote/demote card ranks (9→10 or 9→8)
- `handleCopyMachine()` - Copy last spell's effect
- `handleMirrored()` - Spin to copy/replace community card
- `handleBurned()` - Spin to discard community card
- `handleYesYou()` - Steal random card from player
- `handleThirdEyeBlind()` - Draw extra card into hand
- `handleReflop()` - Replace flop with 3 new cards
- `handleProphecy()` - Peek at next cards
- `handleHotPotato()` - Switch hands with another player
- `handleReturnReriver()` - Replace turn or river
- `handleCallIn()` - Force all-in on blinds
- `handle404Error()` - Disable a rank
- `handleChainReaction()` - Pass hole cards left
- `handleChangeClothes()` - Card counts as any suit
- `handleDrained()` - Spin to potentially pay opponent
- `handleSixthSense()` - Add 6th community card
- `handleReborn()` - Discard and redraw hole cards
- `handleShowMe()` - Force rank reveal
- `handleWildStyle()` - Cards of rank are wild
- `handleVeto()` - Cancel last spell

### Modified Server Files

#### `server/game/roomManager.js`
**Updates**:
- Added power card deck initialization
- Each player starts with **Veto card + 1 random card**
- Updated initial chip balance: **50,000 chips** (50 big blinds)
- Big blind: **1,000 chips**, Small blind: **500 chips**
- Added player properties:
  - `powerCards[]` - Current hand of power cards (max 4)
  - `activePowerCards[]` - Enchantments currently in effect
- Room tracking:
  - `powerCardDeck` - Active deck
  - `discardedPowerCards[]` - For reshuffling
  - `orbitCount` - Track complete dealer rotations
  - `activeEnchantments[]` - Current enchantments

**New Functions**:
- `drawPowerCard()` - Draw from deck (reshuffle if empty)
- `discardPowerCard()` - Discard to discard pile
- `playPowerCard()` - Play card from hand
- `sellPowerCard()` - Sell card for chips
- `givePowerCardToPlayer()` - Add card (respects 4-card max)
- `distributeOrbitPowerCards()` - Draw after each orbit
- `stealRandomPowerCard()` - Steal from opponent

#### `server/sockets/socketHandlers.js`
**New Socket Events**:
- `play_spell` - Play a spell card with optional parameters
- `sell_power_card` - Sell card for its value
- `choose_pot_reward` - Choose between full pot or half pot + steal

**Updated Functions**:
- Imported wizard hand evaluator and spell handlers
- Updated big blind/small blind values (1000/500)

### New Client Files

#### `src/components/PowerCard.js`
Single power card component:
- Shows card name, type, sell value
- Clickable detail popup with description
- "Play Card" and "Sell" buttons
- Respects timing requirements (can only play certain cards at certain times)

#### `src/components/PowerCard.css`
Styling for power cards:
- Card designs with gradients (spells: purple, enchantments: pink, bounties: cyan)
- Hover effects and animations
- Detail popup modal
- Dialog styles for player selection
- Responsive card layout

#### `src/components/PowerCardsHand.js`
Displays player's entire hand of power cards:
- Shows current card count (X/4)
- Handles card selection prompts
- Supports target player selection for spells like "Yes, You"
- Shows card details and allows playing/selling

### Modified Client Files

#### `src/components/Room.js`
**Updates**:
- Added power cards display
- Updated big blind from 2 to 1000
- Added game phase tracking
- Listen for spell-played and card-sold events
- Integrated PowerCardsHand component
- Updated "Start Game" button label

## Gameplay Flow

### 1. Game Initialization
```
Game Start → Deck created (49 total power cards)
         → Each player gets Veto + 1 random card
         → Players start with 50,000 chips
```

### 2. Power Card Distribution
**After Each Orbit** (dealer button completes full rotation):
- Cards distributed clockwise starting from dealer
- Each player draws 1 card (if under 4-card limit)
- Deck reshuffles discards if empty

### 3. Spell Card Timing
Cards can be played during designated windows:
- **ANYTIME** - Play anytime (except when action on different player)
- **BEFORE_DEAL** - Before hole cards dealt
- **ANYTIME_BEFORE_PRE_FLOP_ACTION** - Before betting starts
- **AFTER_FLOP** - After flop revealed
- **AFTER_RIVER** - After river revealed
- **AFTER_ANY_SPELL** - In response to spell (Copy Machine, Veto)

### 4. Winning Pot & Rewards
When a pot is won, winner chooses:

**Option A: Full Pot + Power Card**
- Take entire pot as chips
- Draw 1 power card from deck
- If already have 4 cards, must sell one first

**Option B: Half Pot + Steal Card**
- Take half the pot as chips
- Steal 1 random power card from opponent of choice
- Remaining half rolls into next hand's pot

### 5. Maximum Card Limit
- **Max 4 power cards per player**
- If winning would exceed 4, player must sell one first
- Sell value = card's marked value × current big blind
- Example: Sell a "1 Big Blind" card at 1000 chip blinds = 1000 chips

### 6. Hand Evaluation
- Enchantments modify standard hand evaluation
- New hand types evaluated first (Flush Five > Flush House > Five of a Kind)
- Then standard poker hands
- Can have low-hand-wins scenario (Reverse Reverse REVERSE)

## Configuration

### Current Settings
- **Initial Chips**: 50,000 (50 big blinds)
- **Big Blind**: 1,000 chips
- **Small Blind**: 500 chips
- **Max Power Cards**: 4 per player
- **Power Card Deck**: 49 cards total
- **Total Spells**: 19 unique spells
- **Total Enchantments**: 5 unique enchantments
- **Total Bounties**: 5 unique bounties

### To Adjust
Edit `server/game/roomManager.js` `createRoom()` function:
```javascript
chipBalance: 50000,        // Starting chips
betSize: 1000,             // Big blind
smallBlind: 500,           // Small blind
```

## Known Limitations & TODO

### Partially Implemented
- [ ] Target player selection UI for "Yes, You" spell
- [ ] Spin results UI for spinner-based cards
- [ ] Rank bag selection UI for 404 Error, Show Me, Wild Style
- [ ] Coin flip UI for Drained spell
- [ ] Prophecy card viewing interface
- [ ] Hand sorting with wild cards applied
- [ ] Bounty reward calculations
- [ ] Enchantment persistence across rounds

### Not Yet Implemented
- [ ] Card promotion/demotion (Promotion spell - visual effect only)
- [ ] Change Clothes wild suit tracking in hand eval
- [ ] Hot Potato coin flip result validation
- [ ] Complex multi-card interactions (Chain Reaction with multiple cards in play)
- [ ] Showdown hand display with applied enchantments
- [ ] Power card animations when played

## Testing Recommendations

1. **Start Game**: Verify each player receives Veto + 1 random card
2. **Sell Card**: Test chip balance updates correctly
3. **Play Spell**: Test card disappears from hand
4. **Pot Rewards**: Test both reward options work
5. **Hand Evaluation**: Test custom hands (5 of a kind, flush house, flush five)
6. **Enchantments**: Test hand ranking changes with active enchantments
7. **Max Cards**: Force player to 4 cards, verify must sell to win
8. **Deck Reshuffle**: Play enough cards to trigger reshuffle

## Next Steps for Full Implementation

1. **UI Components**: Create spinner UI, rank selector, coin flip, player selector
2. **Showdown Handler**: Update to use `wizardHandEvaluator` instead of pokersolver
3. **Bounty System**: Implement bounty reward logic in showdown
4. **Animation**: Add visual effects when cards are played
5. **Sound Effects**: Optional audio cues for spells
6. **Advanced Spells**: Full implementation of complex spell interactions
7. **Server Validation**: Validate all spell prerequisites server-side
8. **Client Optimistic Updates**: Show effects immediately before server confirmation

## File Structure Summary

```
poker-for-wizards-2/
├── server/
│   ├── game/
│   │   ├── powerCards.js           (NEW)
│   │   ├── wizardHandEvaluator.js   (NEW)
│   │   ├── spellHandlers.js         (NEW)
│   │   └── roomManager.js           (MODIFIED)
│   └── sockets/
│       └── socketHandlers.js        (MODIFIED)
└── src/
    └── components/
        ├── PowerCard.js             (NEW)
        ├── PowerCard.css            (NEW)
        ├── PowerCardsHand.js        (NEW)
        └── Room.js                  (MODIFIED)
```

---

**Version**: 1.0 (MVP)
**Last Updated**: January 2026
