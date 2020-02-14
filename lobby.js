const Crypto = require("crypto");
module.exports = class Lobby {
  constructor(code, game, isCPU) {
    this.code = code;
    this.cpu = isCPU;
    this.game = game;
    this.token = Crypto.randomBytes(22).toString('hex');
    this.sockets = [null, null];
    this.isWaiting = true;
    this.choosePhase = true;
    this.turn = 0;
    this.selfDestruct = null;
    this._genCards();
  }
  handleData(ws, data) {
    clearTimeout(this.selfDestruct);
    this.selfDestruct = setTimeout(() => {
      this._doSelfDistruct();
    }, 300 * 1000);
    this._ensure_players();
    if (data.cmd == 'join') {
      this._process_join(ws);
    } else if (data.cmd == 'click' && this.sockets.indexOf(ws) == this.turn) {
      let playerIndex = this.sockets.indexOf(ws);
      if (this.choosePhase) {
        this._process_choose_phase(playerIndex, data);
      } else {
        let card = this._getCard(this.playerCards[playerIndex], data);
        if (card != null) {
          if(data.button == 'left') {
            this._process_discard(playerIndex, card);
          } else {
            this._process_meld(playerIndex, card);
          }
          this._check_win();
        }
      }
    }
  }
  _send(ws, data) {
    if (ws !== null) {
      try {
        ws.send(JSON.stringify(data));
        return true;
      } catch (e) {
      }
    }
    return false;
  }
  _getCard(cards, targetCard) {
    for (let card of cards) {
      if (card.suit == targetCard.suit && card.rank == targetCard.rank) {
        return card;
      }
    }
    return null;
  }
  _getCardByValue(cards, suit, value) {
    for (let card of cards) {
      if (card.suit == suit && card.value == value) {
        return card;
      }
    }
    return null;
  }
  _sortDeck(deck) {
    deck.sort((a, b) => {
      if (a.rank != b.rank){
         return a.value - b.value;
      } else {
         return a.suit - b.suit;
      }
    });
  }
  _doSelfDistruct() {
    console.log("Removing Lobby", this.code);
    for(let socket of this.sockets) {
      if(socket != null) {
        socket.terminate();
      }
    }
    this.game.removeLobby(this.code);
  }
  _ensure_players() {
    if(this.cpu) {
      try {
        this._send(this.sockets[0], {cmd: 'ping'});
      } catch (e) {
        this._doSelfDistruct();
      }
    } else {
      for(let i = 0; i < this.sockets.length; i++) {
        if(this.sockets[i] != null) {
          try {
            this._send(this.sockets[i], {cmd: 'ping'});
          } catch (e) {
            this.isWaiting = true;
            this.sockets[i] = null;
          }
        }
      }
    }
  }
  _calculate_card_score(cards) {
    let sum = 0;
    for(let card of cards) {
      if(card.rank == 'A') {
        sum += 1;
      } else if(card.rank == 'J' || card.rank == 'K' || card.rank == 'Q') {
        sum += 10;
      } else {
        sum += card.value + 1;
      }
    }
    return sum;
  }
  _check_win() {
    for(let i = 0; i < this.playerCards.length; i++) {
      if(this.playerCards[i].length == 0) {
        this._send(this.sockets[i], {cmd: 'win', score: this._calculate_card_score(this.playerCards[i ^ 1])});
        this._send(this.sockets[i ^ 1], {cmd: 'loss'});
        this._doSelfDistruct();
        break;
      }
    }
  }
  _process_join(ws) {
    if (!this.isWaiting || this.sockets.indexOf(null) == -1) {
      this._send(ws, {
        cmd: 'exit'
      });

    } else {
      this.sockets[this.sockets.indexOf(null)] = ws;
      if (this.sockets.indexOf(null) == -1 || this.cpu) {
        this.isWaiting = false;
      }
      this._send(ws, { 
        cmd: 'cards',
        cards: this.playerCards[this.sockets.indexOf(ws)],
        opcards: this.playerCards[this.sockets.indexOf(ws) ^ 1].length,
        deck: this.deck.length,
        melds: this.melds,
        draw: this.draw,
        myturn: this.sockets.indexOf(ws) == this.turn
      });
    }
  }
  _process_choose_phase(playerIndex, data) {

    if (data.button == 'left' && data.card == 'deck' && this.deck.length > 0) { // Draw from deck

      let nextCard = this.deck.pop();
      this.playerCards[playerIndex].push(nextCard);
      this._send(this.sockets[playerIndex], {
        cmd: 'draw',
        from: 'deck',
        player: 'me',
        card: nextCard
      });
      this._send(this.sockets[playerIndex ^ 1], {
        cmd: 'draw',
        from: 'deck',
        player: 'op'
      });
      this.choosePhase = false;

    } else if (data.button == 'left' && data.card != 'deck' && this._getCard(this.draw, data) != null && this.draw.length > 0) { // Draw from pile

      let nextCard = this.draw.pop();
      this.playerCards[playerIndex].push(nextCard);

      this._send(this.sockets[playerIndex], {
        cmd: 'draw',
        from: 'draw',
        player: 'me',
        card: nextCard
      });
      this._send(this.sockets[playerIndex ^ 1], {
        cmd: 'draw',
        from: 'draw',
        player: 'op'
      });
      this.choosePhase = false;

    }

  }
  _process_discard(playerIndex, card) {

    this.playerCards[playerIndex].splice(this.playerCards[playerIndex].indexOf(card), 1);
    this.draw.push(card);

    this._send(this.sockets[playerIndex], {
      cmd: 'discard',
      player: 'me',
      card: card
    });
    this._send(this.sockets[playerIndex ^ 1], {
      cmd: 'discard',
      player: 'op',
      card: card
    });
    this.choosePhase = true;
    this.turn ^= 1;

    if(this.turn == 1 && this.cpu) {
      this._play_cpu_turn();
    }

  }
  _process_meld(playerIndex, card) {

    let newMeld = this._create_new_meld(this.playerCards[playerIndex], card);

    if(newMeld.length >= 3) { //-> Create a new meld

      this._sortDeck(newMeld);

      for(let card of newMeld) {
        this.playerCards[playerIndex].splice(this.playerCards[playerIndex].indexOf(card), 1);
      }
      this.melds.push(newMeld);

      this._send(this.sockets[playerIndex], {
        cmd: 'newmeld',
        player: 'me',
        meld: newMeld
      });
      this._send(this.sockets[playerIndex ^ 1], {
        cmd: 'newmeld',
        player: 'op',
        meld: newMeld
      });

    } else {

      let meld = this._create_similar_meld(card);
      if(meld.index >= 0) {

        this.playerCards[playerIndex].splice(this.playerCards[playerIndex].indexOf(card), 1);
        this.melds[meld.index] = meld.meld;

        this._send(this.sockets[playerIndex], {
          cmd: 'addmeld',
          player: 'me',
          index: meld.index,
          card: card,
          meld: meld.meld
        });
        this._send(this.sockets[playerIndex ^ 1], {
          cmd: 'addmeld',
          player: 'op',
          index: meld.index,
          card: card,
          meld: meld.meld
        });
      }
    }
  }

  _create_new_meld(cards, targetCard) {

    let isCard = (deck, suit, value) => this._getCardByValue(deck, suit, value) != null;

    let suitMeld = [targetCard];
    let index = targetCard.value,
        lowerIndex = index - 1,
        upperIndex = index + 1;

    while(lowerIndex >= 0 && isCard(cards, targetCard.suit, lowerIndex)) {
      suitMeld.unshift(this._getCard(cards, {suit: targetCard.suit, rank: this.cardRanks[lowerIndex]}));
      lowerIndex--;
    }

    while(upperIndex < this.cardRanks.length && isCard(cards, targetCard.suit, upperIndex)) {
      suitMeld.push(this._getCard(cards, {suit: targetCard.suit, rank: this.cardRanks[upperIndex]}));
      upperIndex++;
    }
    if(targetCard.value == 0) { 
      targetCard.value = 14;
      let otherMeld = this._create_new_meld(cards, targetCard);
      if(otherMeld.length > suitMeld.length) {
        suitMeld = otherMeld;
      }
    }

    let rankMeld = cards.filter((card) => card.rank == targetCard.rank);

    if(rankMeld.length > suitMeld.length) { 
      return rankMeld;
    } else {
      return suitMeld;
    }

  }
  _create_similar_meld(targetCard) {

    let index = targetCard.value;

    for(let i = 0; i < this.melds.length; i++) {

      let meld = this.melds[i].slice(0);

      if(meld[0].rank != meld[meld.length - 1].rank){ 

        if(meld[0].suit == targetCard.suit) {

          let firstRankIndex = meld[0].value,
              lastRankIndex = meld[meld.length - 1].value;

          if(firstRankIndex - 1 == index) { 
            meld.unshift(targetCard);
            return {index: i, meld: meld};
          } else if(lastRankIndex + 1 == index) {
            meld.push(targetCard);
            return {index: i, meld: meld};
          }
        }
      } else if(meld[0].rank == targetCard.rank) { 

        meld.push(targetCard);
        this._sortDeck(meld);
        return {index: i, meld: meld};
      }
    }

    if(targetCard.value == 0) {
      targetCard.value = 14;
      return this._create_similar_meld(targetCard)
    }
    return {index: -1};
  }
  _genCards() {
    this.cardRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let cards = [];
    for (let suit of ['spade', 'heart', 'diamond', 'club']) {
      for (let i = 2; i <= 10; i++) {
        cards.push({
          html: `.card._${i}.${suit}`,
          suit: suit,
          rank: "" + i,
          value: this.cardRanks.indexOf("" + i)
        });
      }
      for (let face of ['A', 'J', 'Q', 'K']) {
        cards.push({
          html: `.card._${face}.${suit}`,
          suit: suit,
          rank: face,
          value: this.cardRanks.indexOf(face)
        });
      }
    }
    for (let i = cards.length - 1; i > 0; i--) { 
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    this.playerCards = [
      cards.splice(0, 10),
      cards.splice(0, 10)
    ];
    this.melds = [];
    this.draw = cards.splice(0, 1);
    this.deck = cards;
  }
  _play_cpu_turn() {

    let cpuCards = this.playerCards[1];

    setTimeout(() => { 

      let drawFromDeck = Math.random() > .5 || this.draw.length == 0; 
      let data = {cmd: 'click', button: 'left'};
      if(drawFromDeck) {
        data.card = 'deck';
      } else {
        let card = this.draw[this.draw.length - 1];
        data.card = 'notdeck';
        data.rank = card.rank;
        data.suit = card.suit;
      }
      this._process_choose_phase(1, data);
    }, 600);
    setTimeout(() => { 
      for(let card of cpuCards) { 
        this._process_meld(1, card);
      }
    }, 1800);

    setTimeout(() => {

      let discardCard = cpuCards[Math.floor(Math.random() * cpuCards.length)];
      this._process_discard(1, discardCard);
      this._check_win();
    }, 2200);

  }

}
