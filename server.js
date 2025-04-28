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

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('createRoom', (roomData) => {
        const roomId = generateRoomId();
        const player = new Player(roomData.playerName, socket.id);
        player.isHost = true;
        
        rooms[roomId] = {
            id: roomId,
            players: [player],
            gameState: 'waiting',
            currentPlayerIndex: 0,
            settings: {
                playerCount: roomData.playerCount,
                rounds: roomData.rounds,
                timeout: roomData.timeout
            },
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
        
        if (room.gameState !== 'waiting') {
            socket.emit('error', { message: 'Jogo já em andamento' });
            return;
        }
        
        const player = new Player(data.playerName, socket.id);
        room.players.push(player);
        
        socket.join(data.roomId);
        io.to(data.roomId).emit('playerJoined', { 
            players: room.players,
            roomId: data.roomId 
        });
        
        if (room.players.length === room.settings.playerCount) {
            startGame(room);
        }
    });

    socket.on('startGame', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players.find(p => p.id === socket.id)?.isHost) {
            room.gameState = 'playing';
            io.to(data.roomId).emit('gameStarted', {
                settings: room.settings,
                players: room.players
            });
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

        if (room.gameState !== 'playing') {
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
                // O servidor sorteia a carta
                const card = room.deck.draw();
                currentPlayer.addCard(card);
                
                // Envia a informação da carta para todos
                io.to(room.id).emit('gameAction', {
                    playerId: socket.id,
                    action: 'double',
                    data: { card }
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
                    
                    if (room.gameState === 'playing') {
                        room.gameState = 'paused';
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

// Função auxiliar para calcular o resultado
function calculateResult(player, dealer) {
    const playerValue = player.getHandValue();
    const dealerValue = dealer.getHandValue();
    
    if (playerValue > 21) return 'bust';
    if (dealerValue > 21) return 'win';
    if (playerValue > dealerValue) return 'win';
    if (playerValue < dealerValue) return 'lose';
    return 'push';
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
    room.gameState = 'dealerTurn';
    
    console.log('Banca jogando...');
    console.log(`Valor inicial da banca: ${room.dealer.getHandValue()}`);
    
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
    
    // Calcula os resultados
    const results = {
        dealer: {
            hand: room.dealer.hand,
            value: room.dealer.getHandValue()
        },
        players: room.players.map(player => ({
            id: player.id,
            name: player.name,
            hand: player.hand,
            value: player.getHandValue(),
            result: calculateResult(player, room.dealer)
        }))
    };
    
    console.log('Resultados:', results);
    
    // Envia o resultado final
    io.to(room.id).emit('roundEnd', results);
    
    // Aguarda um pouco e inicia nova rodada
    setTimeout(() => {
        console.log('Iniciando nova rodada...');
        startNewRound(room);
    }, 5000);
}

// Função auxiliar para iniciar nova rodada
function startNewRound(room) {
    // Reseta o estado do jogo para playing
    room.gameState = 'playing';
    room.currentPlayerIndex = 0;
    room.deck = new Deck();
    
    console.log('Novo estado do jogo:', room.gameState);
    
    // Reseta os jogadores
    room.players.forEach(player => {
        player.hand = [];
        player.hasPlayed = false;
    });
    
    // Reseta a banca
    room.dealer.hand = [];
    
    // Distribui novas cartas
    distributeInitialCards(room);
    
    // Notifica o início de nova rodada
    io.to(room.id).emit('newRound', {
        players: room.players,
        dealer: room.dealer,
        currentPlayerIndex: room.currentPlayerIndex
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

// Função auxiliar para iniciar o jogo
function startGame(room) {
    room.gameState = 'playing';
    room.currentPlayerIndex = 0;
    room.deck = new Deck();
    
    // Limpa as mãos dos jogadores
    room.players.forEach(player => {
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
        dealer: room.dealer,
        roomId: room.id
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
}); 