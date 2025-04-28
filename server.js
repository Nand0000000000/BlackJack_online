const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { Deck, Player } = require('./gameClasses');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname)));

const rooms = {};

// Estados do jogo
const GAME_STATE = {
    WAITING: 'waiting',     // Esperando jogadores
    BETTING: 'betting',     // Fase de apostas
    PLAYING: 'playing',     // Fase de jogo
    DEALER_TURN: 'dealerTurn', // Vez da banca
    ROUND_END: 'roundEnd'   // Fim da rodada
};

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('createRoom', (roomData) => {
        const roomId = generateRoomId();
        const player = new Player(roomData.playerName, socket.id);
        player.isHost = true;
        player.credits = 100; // Cada jogador começa com 100 créditos
        
        rooms[roomId] = {
            id: roomId,
            players: [player],
            gameState: GAME_STATE.WAITING,
            currentPlayerIndex: 0,
            settings: {
                playerCount: roomData.playerCount,
                rounds: roomData.rounds,
                timeout: roomData.timeout
            },
            currentRound: 0,
            deck: null,
            dealer: new Player('Banca')
        };
        
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
        console.log(`Sala criada: ${roomId}`);
    });

    socket.on('joinRoom', (data) => {
        const room = rooms[data.roomId];
        
        if (!room) {
            socket.emit('error', { message: 'Sala não encontrada' });
            return;
        }
        
        if (room.players.length >= room.settings.playerCount) {
            socket.emit('error', { message: 'Sala cheia' });
            return;
        }
        
        if (room.gameState !== GAME_STATE.WAITING) {
            socket.emit('error', { message: 'Jogo já em andamento' });
            return;
        }
        
        const player = new Player(data.playerName, socket.id);
        player.credits = 100; // Cada jogador começa com 100 créditos
        room.players.push(player);
        
        socket.join(data.roomId);
        io.to(data.roomId).emit('playerJoined', { 
            players: room.players,
            roomId: data.roomId 
        });
        
        if (room.players.length === room.settings.playerCount) {
            startBettingPhase(room);
        }
    });

    socket.on('placeBet', (data) => {
        const room = rooms[data.roomId];
        
        if (!room) {
            socket.emit('error', { message: 'Sala não encontrada' });
            return;
        }
        
        if (room.gameState !== GAME_STATE.BETTING) {
            socket.emit('error', { message: 'Não é o momento de apostar' });
            return;
        }
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player) {
            socket.emit('error', { message: 'Jogador não encontrado' });
            return;
        }
        
        const bet = parseInt(data.bet);
        if (isNaN(bet) || bet <= 0 || bet > player.credits || bet % 10 !== 0) {
            socket.emit('error', { message: 'Aposta inválida. Deve ser múltiplo de 10 e menor que seus créditos.' });
            return;
        }
        
        player.bet = bet;
        player.hasBet = true;
        
        // Notifica todos sobre a aposta
        io.to(room.id).emit('betPlaced', {
            playerId: socket.id,
            playerName: player.name,
            bet: bet
        });
        
        // Verifica se todos os jogadores apostaram
        const allPlayersHaveBet = room.players.every(p => p.hasBet);
        if (allPlayersHaveBet) {
            startGame(room);
        }
    });

    socket.on('gameAction', (data) => {
        console.log('Ação recebida:', data);
        const room = rooms[data.roomId];
        
        if (!room) {
            console.error('Sala não encontrada:', data.roomId);
            socket.emit('error', { message: 'Sala não encontrada' });
            return;
        }

        if (room.gameState !== GAME_STATE.PLAYING) {
            console.error('Jogo não está em andamento');
            socket.emit('error', { message: 'Jogo não está em andamento' });
            return;
        }

        const currentPlayer = room.players[room.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) {
            console.error('Não é a vez do jogador:', socket.id);
            socket.emit('error', { message: 'Não é sua vez de jogar' });
            return;
        }
        
        console.log(`Processando ação ${data.action} do jogador ${currentPlayer.name}`);

        try {
            if (data.action === 'hit') {
                // O servidor sorteia a carta
                const card = room.deck.draw();
                currentPlayer.addCard(card);
                
                // Envia a informação da carta para todos
                io.to(room.id).emit('gameAction', {
                    playerId: socket.id,
                    action: 'hit',
                    data: { card }
                });
                
                // Se o jogador estourou, força o stand
                if (currentPlayer.getHandValue() > 21) {
                    console.log(`Jogador ${currentPlayer.name} estourou com ${currentPlayer.getHandValue()}`);
                    handleStand(room, socket);
                }
            } else if (data.action === 'stand') {
                console.log(`Jogador ${currentPlayer.name} pediu stand`);
                handleStand(room, socket);
            } else if (data.action === 'double') {
                // Verifica se o jogador tem créditos suficientes para dobrar
                if (currentPlayer.credits < currentPlayer.bet) {
                    socket.emit('error', { message: 'Créditos insuficientes para dobrar' });
                    return;
                }
                
                // Dobra a aposta
                currentPlayer.credits -= currentPlayer.bet;
                currentPlayer.bet *= 2;
                
                // O servidor sorteia a carta
                const card = room.deck.draw();
                currentPlayer.addCard(card);
                
                // Envia a informação da carta para todos
                io.to(room.id).emit('gameAction', {
                    playerId: socket.id,
                    action: 'double',
                    data: { card, bet: currentPlayer.bet }
                });
                
                // Força o stand
                handleStand(room, socket);
            }
        } catch (error) {
            console.error('Erro ao processar ação:', error);
            socket.emit('error', { message: 'Erro ao processar ação. Tente novamente.' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);

                if (room.players.length === 0) {
                    delete rooms[roomId];
                    console.log(`Sala removida: ${roomId}`);
                } else {
                    io.to(roomId).emit('playerLeft', { 
                        playerId: socket.id,
                        players: room.players
                    });
                    
                    if (room.gameState === GAME_STATE.PLAYING) {
                        room.gameState = GAME_STATE.ROUND_END;
                        io.to(roomId).emit('gamePaused', { message: 'Um jogador desconectou' });
                    }
                }
                break;
            }
        }
    });
});

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Função para processar os resultados e atualizar créditos
function processResults(room) {
    const dealerValue = room.dealer.getHandValue();
    const dealerBusted = dealerValue > 21;
    
    // Calcula os resultados para cada jogador
    const results = {
        dealer: {
            hand: room.dealer.hand,
            value: dealerValue
        },
        players: room.players.map(player => {
            const playerValue = player.getHandValue();
            const playerBusted = playerValue > 21;
            let result;
            let winnings = 0;
            
            if (playerBusted) {
                result = 'bust';
                // Perde a aposta
            } else if (dealerBusted) {
                result = 'win';
                winnings = player.bet * 2; // Recebe 2x a aposta
            } else if (playerValue > dealerValue) {
                result = 'win';
                winnings = player.bet * 2; // Recebe 2x a aposta
            } else if (playerValue < dealerValue) {
                result = 'lose';
                // Perde a aposta
            } else {
                result = 'push';
                winnings = player.bet; // Recupera a aposta
            }
            
            // Atualiza os créditos do jogador
            player.credits += winnings;
            
            return {
                id: player.id,
                name: player.name,
                hand: player.hand,
                value: playerValue,
                result: result,
                bet: player.bet,
                winnings: winnings,
                credits: player.credits
            };
        })
    };
    
    console.log('Resultados:', results);
    
    // Incrementa o contador de rodadas
    room.currentRound++;
    
    // Envia o resultado final
    io.to(room.id).emit('roundEnd', {
        ...results,
        currentRound: room.currentRound,
        totalRounds: room.settings.rounds
    });
    
    // Aguarda um pouco e decide se continua ou encerra o jogo
    room.gameState = GAME_STATE.ROUND_END;
    setTimeout(() => {
        if (room.currentRound >= room.settings.rounds) {
            console.log('Jogo encerrado após', room.currentRound, 'rodadas');
            // Encerra o jogo e mostra o resultado final
            io.to(room.id).emit('gameEnd', {
                players: room.players.map(player => ({
                    id: player.id,
                    name: player.name,
                    credits: player.credits
                }))
            });
        } else {
            console.log('Iniciando nova fase de apostas para rodada', room.currentRound + 1);
            startBettingPhase(room);
        }
    }, 5000);
}

// Função para iniciar a fase de apostas
function startBettingPhase(room) {
    room.gameState = GAME_STATE.BETTING;
    
    // Reseta as apostas anteriores
    room.players.forEach(player => {
        player.hasBet = false;
        player.bet = 0;
    });
    
    // Notifica os jogadores sobre a fase de apostas
    io.to(room.id).emit('bettingPhase', {
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            credits: p.credits
        })),
        currentRound: room.currentRound + 1,
        totalRounds: room.settings.rounds
    });
}

// Função auxiliar para lidar com a ação de stand
function handleStand(room, socket) {
    const currentPlayer = room.players[room.currentPlayerIndex];
    
    // Envia a ação de stand para todos os jogadores
    io.to(room.id).emit('gameAction', {
        playerId: socket.id,
        action: 'stand'
    });
    
    // Marca o jogador atual como tendo jogado
    currentPlayer.hasPlayed = true;
    console.log(`Marcando jogador ${currentPlayer.name} como tendo jogado`);
    
    // Verifica se todos os jogadores já jogaram
    const allPlayersPlayed = room.players.every(player => player.hasPlayed);
    console.log(`Todos os jogadores jogaram? ${allPlayersPlayed}`);
    
    if (allPlayersPlayed) {
        console.log('Todos os jogadores jogaram, vez da banca');
        dealerPlay(room);
    } else {
        // Avança para o próximo jogador que ainda não jogou
        do {
            room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
        } while (room.players[room.currentPlayerIndex].hasPlayed);
        
        console.log(`Próximo jogador: ${room.players[room.currentPlayerIndex].name}`);
        
        // Notifica o próximo jogador
        io.to(room.id).emit('nextPlayer', {
            currentPlayerIndex: room.currentPlayerIndex,
            currentPlayer: room.players[room.currentPlayerIndex]
        });
    }
}

// Função auxiliar para a jogada da banca
function dealerPlay(room) {
    room.gameState = GAME_STATE.DEALER_TURN;
    
    console.log('Banca jogando...');
    console.log(`Valor inicial da banca: ${room.dealer.getHandValue()}`);
    
    // Primeiro, revela a segunda carta da banca para todos
    io.to(room.id).emit('revealDealerCard', {
        card: room.dealer.hand[1]
    });
    
    // Pequena pausa para mostrar a carta revelada antes da banca jogar
    setTimeout(() => {
        // Banca joga até ter 17 ou mais
        while (room.dealer.getHandValue() < 17) {
            const card = room.deck.draw();
            room.dealer.addCard(card);
            
            console.log(`Banca pegou ${card.value}${card.suit}, novo valor: ${room.dealer.getHandValue()}`);
            
            io.to(room.id).emit('gameAction', {
                playerId: 'dealer',
                action: 'hit',
                data: { card }
            });
        }
        
        console.log(`Valor final da banca: ${room.dealer.getHandValue()}`);
        
        // Processa os resultados e atualiza os créditos
        processResults(room);
    }, 2000);
}

// Função auxiliar para iniciar o jogo
function startGame(room) {
    room.gameState = GAME_STATE.PLAYING;
    room.currentPlayerIndex = 0;
    room.deck = new Deck();
    
    console.log('Novo estado do jogo:', room.gameState);
    console.log('Iniciando rodada', room.currentRound + 1, 'de', room.settings.rounds);
    
    // Reduz os créditos dos jogadores com base nas apostas
    room.players.forEach(player => {
        player.credits -= player.bet;
        player.hand = [];
        player.hasPlayed = false;
    });
    
    // Limpa a mão da banca
    room.dealer.hand = [];
    
    // Distribui as cartas iniciais
    distributeInitialCards(room);
    
    // Notifica o início do jogo
    io.to(room.id).emit('gameStarted', {
        settings: room.settings,
        players: room.players,
        currentPlayerIndex: room.currentPlayerIndex,
        currentRound: room.currentRound + 1,
        totalRounds: room.settings.rounds,
        dealer: {
            hand: [room.dealer.hand[0]], // Envia apenas a primeira carta da banca
            visibleCard: room.dealer.hand[0]
        },
        roomId: room.id
    });
}

// Função auxiliar para distribuir cartas iniciais
function distributeInitialCards(room) {
    // Distribui 2 cartas para cada jogador
    room.players.forEach(player => {
        player.addCard(room.deck.draw());
        player.addCard(room.deck.draw());
    });
    
    // Distribui 2 cartas para a banca
    room.dealer.addCard(room.deck.draw());
    room.dealer.addCard(room.deck.draw());
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
}); 