const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname)));

const rooms = {};

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('createRoom', (roomData) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            id: roomId,
            players: [{
                id: socket.id,
                name: roomData.playerName,
                isHost: true
            }],
            gameState: 'waiting',
            settings: {
                playerCount: roomData.playerCount,
                rounds: roomData.rounds,
                timeout: roomData.timeout
            }
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
        
        room.players.push({
            id: socket.id,
            name: data.playerName,
            isHost: false
        });
        
        socket.join(data.roomId);
        io.to(data.roomId).emit('playerJoined', { players: room.players });
        
        if (room.players.length === room.settings.playerCount) {
            room.gameState = 'playing';
            io.to(data.roomId).emit('gameStarted', {
                settings: room.settings,
                players: room.players
            });
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
        const room = rooms[data.roomId];
        if (room && room.gameState === 'playing') {
            io.to(data.roomId).emit('gameAction', {
                playerId: socket.id,
                action: data.action,
                data: data.gameData
            });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
}); 