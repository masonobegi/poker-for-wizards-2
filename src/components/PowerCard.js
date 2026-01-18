import React, { useState } from 'react';
import './PowerCard.css';

export default function PowerCard({ card, onPlay, onSell, isMyTurn, gamePhase }) {
  const [showDetail, setShowDetail] = useState(false);

  const canPlay = () => {
    if (!isMyTurn) return false;

    // Temporarily allow all cards to be playable
    // TODO: Implement proper phase checking when gamePhase is sent from server
    return true;
  };

  return (
    <div
      className={`power-card ${card.type} ${canPlay() ? 'playable' : 'disabled'}`}
      onClick={() => setShowDetail(!showDetail)}
    >
      <div className="card-header">
        <div className="card-name">{card.name}</div>
        <div className="card-type">{card.type}</div>
      </div>

      <div className="card-sell-value">
        💰 {card.sellValue} BB
      </div>

      {showDetail && (
        <div className="card-detail-popup">
          <div className="card-description">
            <p>{card.description}</p>
            <p className="card-timing">
              <strong>When:</strong> {card.timeTrigger.replace(/_/g, ' ')}
            </p>
          </div>

          <div className="card-actions">
            {canPlay() && (
              <button
                className="btn-play"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(card.uniqueId);
                  setShowDetail(false);
                }}
              >
                Play Card
              </button>
            )}
            <button
              className="btn-sell"
              onClick={(e) => {
                e.stopPropagation();
                onSell(card.uniqueId);
                setShowDetail(false);
              }}
            >
              Sell for {card.sellValue} BB
            </button>
            <button
              className="btn-close"
              onClick={(e) => {
                e.stopPropagation();
                setShowDetail(false);
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
