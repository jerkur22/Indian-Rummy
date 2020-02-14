//deals with new socket data
handle.connected = (data) => { 
  sendData({
    cmd: 'join'
  });
}
handle.exit = (data) =>{ 
  window.location.href = "/";
}
handle.cards = (data) =>{
  for (let card of data.cards) {
    $("#cards").append(`<div class="card _${card.rank} ${card.suit} myhand"></div>`);
    hand.push(card);
  }
  for (let card of data.draw){
    $("#cards").append(`<div class="card _${card.rank} ${card.suit}"></div>`);
    draw.push(card);
  }
  for (let meld of data.melds){
    for (let card of meld){
      $("#cards").append(`<div class="card _${card.rank} ${card.suit}"></div>`);
    }
    melds.push(meld);
  }
  //fake cards to BAMBLOOZE 
  ophand = createFakeCards('ophand', data.opcards);
  deck = createFakeCards('deck', data.deck);
  renderHand(hand);
  renderHand(ophand, flip=true);
  renderDeck(deck, left=true);
  renderDeck(draw);
  renderMelds(melds);
  renderHint();
  setGlow($('.ophand'), 15, '#005bf9');
  setGlow($('.myhand'), 15, '#ff6500');
  setClickHandle();
  if(data.myturn) {
    $('#hints').html('<h5>Left Click to select <br> a card from the middle</h5>');
  } else {
    $('#hints').html('<h5>Opponents Turn...</h5>');
  }
}
handle.draw = (data) => { 
  let nextCard = {};
  if (data.from == 'deck') { 
    nextCard = deck.pop();
  } else {
    nextCard = draw.pop();
  }
  if (data.player == 'me') { 
    $(nextCard.html).attr('class', `card _${data.card.rank} ${data.card.suit} myhand`);
    hand.push(data.card);
    renderHand(hand);
    $('#hints').html('<h5>Right Click your hand <br> to create a meld or <br> Left Click to discard <br> a card and end your turn</h5>');
  } else {
    $(nextCard.html).attr('class', `card ophand fake_${ophand.length} unknown`);
    ophand.push({
      html: `.card.fake_${ophand.length}.ophand`,
      suit: 'none',
      rank: 'none'
    });
    renderHand(ophand, flip=true);
  }
  setGlow($('.ophand'), 15, '#005bf9');
  setGlow($('.myhand'), 15, '#ff6500');
}
handle.discard = (data) => { 
  if (data.player == 'me') { 
    hand.splice(hand.indexOf(getCard(hand, data.card)), 1);
    $(data.card.html).attr('class', `card _${data.card.rank} ${data.card.suit}`);
    draw.push(data.card);
    renderHand(hand);
    renderDeck(draw);
    $('#hints').html('<h5>Opponents Turn...</h5>');
  } else {
    let nextCard = ophand.pop();
    $(nextCard.html).attr('class', `card _${data.card.rank} ${data.card.suit}`);
    draw.push(data.card);
    renderHand(ophand, flip=true);
    renderDeck(draw);
    $('#hints').html('<h5>Left Click to select <br> a card from the middle</h5>');
  }
  setGlow($('.ophand'), 15, '#005bf9');
  setGlow($('.myhand'), 15, '#ff6500');
}
handle.newmeld = (data) => { 
  if (data.player == 'me') {
    for(let card of data.meld) {
      hand.splice(hand.indexOf(getCard(hand, card)), 1);
    }
    melds.push(data.meld);
    renderHand(hand);
    renderMelds(melds);
  } else {
    for(let card of data.meld) {
      let nextCard = ophand.pop();
      $(nextCard.html).attr('class', `card _${card.rank} ${card.suit}`);
    }
    melds.push(data.meld);
    renderHand(ophand, flip=true);
    renderMelds(melds);
  }
}
handle.addmeld = (data) => { 
  if (data.player == 'me') { 
    hand.splice(hand.indexOf(getCard(hand, data.card)), 1);
    melds[data.index] = data.meld;
    renderHand(hand);
    renderMelds(melds);
  } else {
    let nextCard = ophand.pop();
    $(nextCard.html).attr('class', `card _${data.card.rank} ${data.card.suit}`);
    melds[data.index] = data.meld;
    renderHand(ophand, flip=true);
    renderMelds(melds);
  }
}
handle.win = (data) => { 
  $('#alert').attr('class', 'alert alert-success');
  $('#alert').html(`<h4 class="alert-heading">You Won! Score: ${data.score}</h4><p id="exitmsg"></p>`);
  $('#alert').fadeToggle();
  $('.card').unbind('click');
  showConfetti();
  beginLeave();
}

handle.loss = (data) => { 
  $('#alert').attr('class', 'alert alert-danger');
  $('#alert').html('<h4 class="alert-heading">You Lost!</h4><p id="exitmsg"></p>');
  $('#alert').fadeToggle();
  $('.card').unbind('click');
  beginLeave();
}
