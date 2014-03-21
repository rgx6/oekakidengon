var fs = require('fs');
var uuid = require('node-uuid');
var log4js = require('log4js');
var logger = log4js.getLogger('OekakiDengon');
var server = require('../server.js');
var db = require('./db.js');
var Game = require('./Game.js').Game;

var RESULT_OK            = 'ok';
var RESULT_BAD_PARAM     = 'bad param';
var RESULT_PASSWORD_NG   = 'password ng';
var RESULT_GAME_FULL     = 'game full';
var RESULT_CREATE_MAX    = 'create max';
var RESULT_INVALID_TOKEN = 'invalid token';
var RESULT_CREATED_GAME  = 'created game';
var RESULT_PLAYED_GAME   = 'played game';
var RESULT_WATCHED_GAME  = 'watched game';
var RESULT_ANSWERED_GAME = 'answered game';
var RESULT_RESULT_VIEWED = 'result viewed';
var RESULT_NOW_PLAYING   = 'now playing';
var RESULT_SYSTEM_ERROR  = 'system error';

var AUTHORITY_TYPE_DRAW_ENTER         = 'authority type draw enter';
var AUTHORITY_TYPE_DRAW_SEND_IMAGE    = 'authority type draw send image';
var AUTHORITY_TYPE_WATCH_ENTER        = 'authority type watch enter';
var AUTHORITY_TYPE_ANSWER_ENTER       = 'authority type answer enter';
var AUTHORITY_TYPE_ANSWER_SEND_ANSWER = 'authority type answer send answer';
var AUTHORITY_TYPE_LIST_ENTER         = 'authority type list enter';

var ROLE_CREATE = 'create';
var ROLE_DRAW   = 'draw';
var ROLE_WATCH  = 'watch';
var ROLE_ANSWER = 'answer';
var ROLE_LIST   = 'list';

var KEY_PLAYER_ID = 'playerId';

var PLAYER_NAME_DEFAULT = '名無しさん';
var ROUND_DEFAULT       = 5;
var VIEW_TIME_DEFAULT   = 5;
var DRAW_TIME_DEFAULT   = 30;
var ANSWER_TIME_DEFAULT = 30;

var PLAYER_NAME_LENGTH_MAX = exports.PLAYER_NAME_LENGTH_MAX = 10;
var ANSWER_LENGTH_MAX      = exports.ANSWER_LENGTH_MAX      = 10;
var GAME_NAME_LENGTH_MAX   = exports.GAME_NAME_LENGTH_MAX   = 10;
var COMMENT_LENGTH_MAX     = exports.COMMENT_LENGTH_MAX     = 20;
var PASSWORD_LENGTH_MAX    = exports.PASSWORD_LENGTH_MAX    = 10;
var ROUND_MIN              = exports.ROUND_MIN              = 2;
var ROUND_MAX              = exports.ROUND_MAX              = 20;
var VIEW_TIME_MIN          = exports.VIEW_TIME_MIN          = 1;
var VIEW_TIME_MAX          = exports.VIEW_TIME_MAX          = 15;
var DRAW_TIME_MIN          = exports.DRAW_TIME_MIN          = 15;
var DRAW_TIME_MAX          = exports.DRAW_TIME_MAX          = 60;
var ANSWER_TIME_MIN        = exports.ANSWER_TIME_MIN        = 15;
var ANSWER_TIME_MAX        = exports.ANSWER_TIME_MAX        = 60;

// hack : ダイアログの表示時間を制御できるようになるまではここで時間切れを調整
var TOKEN_EXPIRED_TIME_BUFFER = 120;

var INDEX_ROOM = 'index';

// hack : 進行中と終了したゲームの管理を統合する？
var games = {};
var endGames = {};
var tokens = {};

var globalUserCount = 0;

var performanceLogger = setInterval(function () {
    logger.info('connectionCount: ' + globalUserCount + ', memoryUsage: ' + JSON.stringify(process.memoryUsage()));
}, 20000);

// hack : 起動時の読み込み処理が同期処理だとデータサイズが大きくなった場合に困る
// 進行中のゲームの読込
var query = db.Game.find({ is_gameover: false }).sort({ registered_time: 'asc' });
query.exec(function (err, docs) {
    if (err) return logger.error(err);
    docs.forEach(function (doc) {
        games[doc._id] = new Game(
            doc._id,
            doc.name,
            doc.answer,
            doc.rounds.length,
            doc.round_max,
            doc.view_time,
            doc.draw_time,
            doc.answer_time,
            doc.creator_id,
            doc.comment,
            doc.password);
    });
});

// 終了したゲームの読込
var query2 = db.Game.find({ is_gameover: true }).sort({ updated_time: 'asc' });
query2.exec(function (err, docs) {
    if (err) return logger.error(err);
    docs.forEach(function (doc) {
        endGames[doc._id] = new Game(
            doc._id,
            doc.name,
            doc.answer,
            doc.rounds.length,
            doc.round_max,
            doc.view_time,
            doc.draw_time,
            doc.answer_time,
            doc.creator_id,
            doc.comment,
            doc.password);
    });
});

exports.onConnection = function (client) {
    'use strict';
    logger.debug('connected : ' + client.id);

    client.emit('connected');
    globalUserCount += 1;

    /**
     * ページ表示後の初期化(index)
     */
    client.on('init index', function (data, callback) {
        'use strict';
        logger.debug('init index : ' + client.id);
        logger.trace(data);

        if (!data) {
            logger.warn('init index : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        if (data.playerId) {
            var query = db.Player.where({ _id: data.playerId }).select({ name: 1 });
            query.findOne(function (err, doc) {
                if (err) {
                    // hack : rollbackなどでdbにplayerIdが存在しない場合、
                    // client側でlocalStorageを削除しない限り動作しなくなる。
                    logger.error(err);
                    return callback({ result: RESULT_BAD_PARAM });
                }
                if (doc) {
                    logger.trace(doc);
                    client.join(INDEX_ROOM);
                    client.set(KEY_PLAYER_ID, doc._id);
                    callback({
                        result:     RESULT_OK,
                        playerName: doc.name,
                    });
                    sendGameList(client);
                    return;
                }
            });
            return;
        }

        var player = new db.Player();
        if (data.playerId) player._id = data.playerId;
        player.name = data.playerName ? data.playerName : PLAYER_NAME_DEFAULT;
        player.registered_time = new Date();
        player.updated_time = player.registered_time;
        player.save(function (err, doc) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            client.join(INDEX_ROOM);
            client.set(KEY_PLAYER_ID, doc._id);
            callback({
                result:     RESULT_OK,
                playerId:   doc._id,
                playerName: doc.name,
            });
            sendGameList(client);
        });
    });

    /**
     * 名前変更リクエスト受付
     */
    client.on('update name', function (data, callback) {
        'use strict';
        logger.debug('update name : ' + client.id);
        logger.trace(data);

        var playerId;
        client.get(KEY_PLAYER_ID, function (err, _playerId) {
            if (err || !_playerId) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            playerId = _playerId;
        });

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.playerName)) {
            logger.warn('update name : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var name = data.playerName.trim();
        if (!checkParamLength(name, 0, PLAYER_NAME_LENGTH_MAX)) {
            logger.warn('update name : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        if (name.length === 0) name = PLAYER_NAME_DEFAULT;
        db.Player.findByIdAndUpdate(playerId, { name: name, updated_time: new Date() }, function (err) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            callback({
                result:     RESULT_OK,
                playerName: name,
            });
        });
    });

    /**
     * ゲーム作成リクエスト受付
     */
    client.on('start game', function (data, callback) {
        'use strict';
        logger.debug('start game : ' + client.id);
        logger.trace(data);

        var playerId;
        client.get(KEY_PLAYER_ID, function (err, _playerId) {
            if (err || !_playerId) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            playerId = _playerId;
        });

        // hack : とりあえず20件までに制限
        if (Object.keys(games).length >= 20) {
            logger.warn('starg game : ' + client.id + ' : ' + RESULT_GAME_FULL);
            return callback({ result: RESULT_GAME_FULL });
        }

        // hack : とりあえずplayerあたりの進行中ゲーム作成上限を2に設定
        var playerGameCount = 0;
        for (var key in games) {
            if (games[key].playerId.toString() === playerId.toString()) playerGameCount += 1;
        }
        if (2 <= playerGameCount) {
            logger.warn('starg game : ' + client.id + ' : ' + RESULT_CREATE_MAX);
            return callback({ result: RESULT_CREATE_MAX });
        }

        if (isUndefinedOrNull(data)            ||
            isUndefinedOrNull(data.name)       ||
            isUndefinedOrNull(data.answer)     ||
            isUndefinedOrNull(data.comment)
            // isUndefinedOrNull(data.password)   ||
            // isUndefinedOrNull(data.round)      || isNaN(data.round)    ||
            // isUndefinedOrNull(data.viewTime)   || isNaN(data.viewTime) ||
            // isUndefinedOrNull(data.drawTime)   || isNaN(data.drawTime) ||
            // isUndefinedOrNull(data.answerTime) || isNaN(data.answerTime)
        ) {
            logger.warn('start game : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var name       = data.name.trim();
        var answer     = data.answer.trim();
        var comment    = data.comment.trim();
        // var password   = data.password.trim();
        // var round      = Number(data.round);
        // var viewTime   = Number(data.viewTime);
        // var drawTime   = Number(data.drawTime);
        // var answerTime = Number(data.answerTime);
        var password   = '';
        var round      = ROUND_DEFAULT;
        var viewTime   = VIEW_TIME_DEFAULT;
        var drawTime   = DRAW_TIME_DEFAULT;
        var answerTime = ANSWER_TIME_DEFAULT;
        if (!checkParamLength(name, 0, GAME_NAME_LENGTH_MAX)        ||
            !checkParamLength(answer, 1, ANSWER_LENGTH_MAX)         ||
            !checkParamLength(comment, 0, COMMENT_LENGTH_MAX)
            // !checkParamLength(password, 0, PASSWORD_LENGTH_MAX)     ||
            // !checkParamSize(round, ROUND_MIN, ROUND_MAX)            ||
            // !checkParamSize(viewTime, VIEW_TIME_MIN, VIEW_TIME_MAX) ||
            // !checkParamSize(drawTime, DRAW_TIME_MIN, DRAW_TIME_MAX) ||
            // !checkParamSize(answerTime, ANSWER_TIME_MIN, ANSWER_TIME_MAX)
        ) {
            logger.warn('start game : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });                
        }

        db.Game.count(function (err, count) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }

            // hack : ゲーム名が指定されている場合は無駄な処理なので省略したい
            // default game name
            if (name.length === 0) {
                name = 'ゲーム ' + (count + 1);
            }
            // todo : お題をランダムで決める機能
            // if (answer.length === 0) {
            //     answer = '未実装'
            // }
    
            var game = new db.Game();
            game.name            = name;
            game.answer          = answer;
            game.round_max       = round;
            game.view_time       = viewTime;
            game.draw_time       = drawTime;
            game.answer_time     = answerTime;
            game.creator_id      = playerId;
            game.comment         = comment;
            game.password        = password;
            game.is_gameover     = false;
            game.registered_time = new Date();
            game.updated_time    = game.registered_time;
            game.save(function (err, doc) {
                if (err) {
                    logger.error(err);
                    return callback({ result: RESULT_SYSTEM_ERROR });
                }
    
                var playLog = new db.PlayLog();
                playLog.game_id         = doc._id;
                playLog.player_id       = playerId;
                playLog.role            = ROLE_CREATE;
                playLog.registered_time = new Date();
                playLog.updated_time    = new Date();
                playLog.save(function (err) {
                    if (err) {
                        logger.error(err);
                        return callback({ result: RESULT_SYSTEM_ERROR });
                    }
    
                    games[doc._id] = new Game(
                        doc._id,
                        doc.name,
                        doc.answer,
                        0,
                        doc.round_max,
                        doc.view_time,
                        doc.draw_time,
                        doc.answer_time,
                        doc.creator_id,
                        doc.comment,
                        doc.password);
    
                    logger.trace(games[doc._id]);
                    callback({
                        result: RESULT_OK,
                        gameId: doc._id,
                    });

                    noticeGameUpdate();
                });
            });
        });
    });

    /**
     * ゲーム参加リクエスト受付（描く）
     */
    client.on('request for draw', function (data, callback) {
        'use strict';
        logger.debug('request for draw : ' + client.id);
        logger.trace(data);

        var playerId;
        client.get(KEY_PLAYER_ID, function (err, _playerId) {
            if (err || !_playerId) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            playerId = _playerId;
        });

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.gameId)) {
            logger.warn('request for draw : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var game = games[data.gameId];
        if (isUndefinedOrNull(game)) {
            logger.error('game not exists. gameId: ' + data.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        if (game.password && game.password !== data.password) {
            logger.warn('request for draw : ' + client.id + ' : ' + RESULT_PASSWORD_NG);
            return callback({ result: RESULT_PASSWORD_NG });
        }

        var query = db.PlayLog.find({ game_id: data.gameId, player_id: playerId }).select({ role: 1 });
        query.exec(function (err, docs) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }

            if (playlogContainsRole(docs, ROLE_DRAW)) {
                return callback({ result: RESULT_PLAYED_GAME });
            } else if (playlogContainsRole(docs, ROLE_WATCH)) {
                return callback({ result: RESULT_WATCHED_GAME });
            } else if (game.round !== 0 && playlogContainsRole(docs, ROLE_CREATE)) {
                return callback({ result: RESULT_CREATED_GAME });
            }

            if (game.roundToken !== null) {
                var tokenInfo = tokens[game.roundToken];
                if (!isUndefinedOrNull(tokenInfo) && new Date().getTime() < tokenInfo.expire) {
                    logger.warn('request for draw : ' + client.id + ' : ' + RESULT_NOW_PLAYING);
                    return callback({ result: RESULT_NOW_PLAYING });
                }
            }

            var token = uuid.v4().replace(/-/g, '');
            game.roundToken = token;
            game.roundPlayerId = playerId;

            tokens[token] = {
                gameId:        data.gameId,
                authorityType: AUTHORITY_TYPE_DRAW_ENTER,
                expire:        new Date().getTime() + 10 * 1000,
                playerId:      playerId,
            };

            callback({
                result: RESULT_OK,
                token:  token,
            });
        });
    });

    /**
     * ゲーム参加リクエスト受付（見物）
     */
    client.on('request for watch', function (data, callback) {
        'use strict';
        logger.debug('request for watch : ' + client.id);
        logger.trace(data);

        var playerId;
        client.get(KEY_PLAYER_ID, function (err, _playerId) {
            if (err || !_playerId) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            playerId = _playerId;
        });

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.gameId)) {
            logger.warn('request for watch : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var game = games[data.gameId];
        if (isUndefinedOrNull(game)) {
            logger.error('game not exists. gameId: ' + data.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        if (game.password && game.password !== data.password) {
            logger.warn('request for watch : ' + client.id + ' : ' + RESULT_PASSWORD_NG);
            return callback({ result: RESULT_PASSWORD_NG });
        }

        var token = uuid.v4().replace(/-/g, '');

        tokens[token] = {
            gameId:        data.gameId,
            authorityType: AUTHORITY_TYPE_WATCH_ENTER,
            expire:        new Date().getTime() + 10 * 1000,
            playerId:      playerId,
        };

        callback({
            result: RESULT_OK,
            token:  token,
        });
    });

    /**
     * ゲーム参加リクエスト受付（解答）
     */
    client.on('request for answer', function (data, callback) {
        'use strict';
        logger.debug('request for answer : ' + client.id);
        logger.trace(data);

        var playerId;
        client.get(KEY_PLAYER_ID, function (err, _playerId) {
            if (err || !_playerId) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            playerId = _playerId;
        });

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.gameId)) {
            logger.warn('request for answer : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var endGame = endGames[data.gameId];
        if (isUndefinedOrNull(endGame)) {
            logger.error('game not exists. gameId: ' + data.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        var query = db.PlayLog.find({ game_id: data.gameId, player_id: playerId }).select({ role: 1 });
        query.exec(function (err, docs) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }

            if (playlogContainsRole(docs, ROLE_DRAW)) {
                return callback({ result: RESULT_PLAYED_GAME });
            } else if (playlogContainsRole(docs, ROLE_WATCH)) {
                return callback({ result: RESULT_WATCHED_GAME });
            } else if (playlogContainsRole(docs, ROLE_CREATE)) {
                return callback({ result: RESULT_CREATED_GAME });
            } else if (playlogContainsRole(docs, ROLE_ANSWER)) {
                return callback({ result: RESULT_ANSWERED_GAME });
            } else if (playlogContainsRole(docs, ROLE_LIST)) {
                return callback({ result: RESULT_RESULT_VIEWED });
            }

            var token = uuid.v4().replace(/-/g, '');

            tokens[token] = {
                gameId:        data.gameId,
                authorityType: AUTHORITY_TYPE_ANSWER_ENTER,
                expire:        new Date().getTime() + 10 * 1000,
                playerId:      playerId,
            };

            callback({
                result: RESULT_OK,
                token:  token,
            });
        });
    });

    /**
     * ゲーム参加リクエスト受付（結果）
     */
    client.on('request for result', function (data, callback) {
        'use strict';
        logger.debug('request for result : ' + client.id);
        logger.trace(data);

        var playerId;
        client.get(KEY_PLAYER_ID, function (err, _playerId) {
            if (err || !_playerId) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            playerId = _playerId;
        });

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.gameId)) {
            logger.warn('request for result : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var endGame = endGames[data.gameId];
        if (isUndefinedOrNull(endGame)) {
            logger.error('request for result: ' + data.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        var token = uuid.v4().replace(/-/g, '');

        tokens[token] = {
            gameId:        data.gameId,
            authorityType: AUTHORITY_TYPE_LIST_ENTER,
            expire:        new Date().getTime() + 10 * 1000,
            playerId:      playerId,
        };

        callback({
            result: RESULT_OK,
            token:  token,
        });
    });

    /**
     * ページ表示後の初期化(描く)
     */
    client.on('init draw', function (data, callback) {
        'use strict';
        logger.debug('init draw : ' + client.id);
        logger.trace(data);

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.token)) {
            logger.warn('init draw : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var tokenInfo = tokens[data.token];
        delete(tokens[data.token]);

        if (isUndefinedOrNull(tokenInfo) ||
            !checkToken(data.token, tokenInfo, AUTHORITY_TYPE_DRAW_ENTER)) {
            logger.warn('init draw : ' + client.id + ' : ' + RESULT_INVALID_TOKEN);
            return callback({ result: RESULT_INVALID_TOKEN });
        }

        var game = games[tokenInfo.gameId];
        if (isUndefinedOrNull(game)) {
            logger.error('game not exists. gameId: ' + tokenInfo.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        var playLog = new db.PlayLog();
        playLog.game_id         = tokenInfo.gameId;
        playLog.player_id       = tokenInfo.playerId;
        playLog.role            = ROLE_DRAW;
        playLog.registered_time = new Date();
        playLog.updated_time    = new Date();
        playLog.save(function (err) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            var newToken = uuid.v4().replace(/-/g, '');
            game.roundToken = newToken;
            game.roundPlayerId = tokenInfo.playerId;

            db.Player.findById(game.roundPlayerId, function (err, player) {
                if (err) {
                    logger.error(err);
                    return callback({ result: RESULT_SYSTEM_ERROR });
                }

                if (game.round === 0) {
                    tokens[newToken] = {
                        gameId:        tokenInfo.gameId,
                        authorityType: AUTHORITY_TYPE_DRAW_SEND_IMAGE,
                        expire:        new Date().getTime() + 1000 * (game.drawTime + TOKEN_EXPIRED_TIME_BUFFER),
                        playerId:      tokenInfo.playerId,
                    };

                    game.deleteImage();
                    client.join(tokenInfo.gameId);
                    var data = {
                        round:      game.round + 1,
                        roundMax:   game.roundMax,
                        playerName: player.name,
                    };
                    client.broadcast.to(tokenInfo.gameId).emit('push init round', data);

                    callback({
                        result:       RESULT_OK,
                        token:        newToken,
                        isFirstRound: true,
                        answer:       game.answer,
                        drawTime:     game.drawTime,
                    });
                } else {
                    tokens[newToken] = {
                        gameId:        tokenInfo.gameId,
                        authorityType: AUTHORITY_TYPE_DRAW_SEND_IMAGE,
                        expire:        new Date().getTime() + 1000 * (game.viewTime + game.drawTime + TOKEN_EXPIRED_TIME_BUFFER),
                        playerId:      tokenInfo.playerId,
                    };
                    db.Game.findById(tokenInfo.gameId, function (err, doc) {
                        if (err) {
                            logger.error(err);
                            return callback({ result: RESULT_SYSTEM_ERROR });
                        }

                        game.deleteImage();
                        client.join(tokenInfo.gameId);
                        var data = {
                            round:      game.round + 1,
                            roundMax:   game.roundMax,
                            playerName: player.name,
                        };
                        client.broadcast.to(tokenInfo.gameId).emit('push init round', data);

                        callback({
                            result:       RESULT_OK,
                            token:        newToken,
                            isFirstRound: false,
                            fileName:     doc.rounds[doc.rounds.length - 1].file_name,
                            viewTime:     game.viewTime,
                            drawTime:     game.drawTime,
                        });
                    });
                }
            });
        });
    });

    /**
     * ページ表示後の初期化(見物)
     */
    client.on('init watch', function (data, callback) {
        'use strict';
        logger.debug('init watch : ' + client.id);
        logger.trace(data);

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.token)) {
            logger.warn('init watch : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var tokenInfo = tokens[data.token];
        delete(tokens[data.token]);

        if (isUndefinedOrNull(tokenInfo) ||
            !checkToken(data.token, tokenInfo, AUTHORITY_TYPE_WATCH_ENTER)) {
            logger.warn('init watch : ' + client.id + ' : ' + RESULT_INVALID_TOKEN);
            return callback({ result: RESULT_INVALID_TOKEN });
        }

        var game = games[tokenInfo.gameId];
        if (isUndefinedOrNull(game)) {
            logger.error('game not exists. gameId: ' + tokenInfo.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        db.PlayLog.update({
            game_id:   tokenInfo.gameId,
            player_id: tokenInfo.playerId,
            role:      ROLE_WATCH,
        }, {
            $setOnInsert: {
                game_id:         tokenInfo.gameId,
                player_id:       tokenInfo.playerId,
                role:            ROLE_WATCH,
                registered_time: new Date(),
            },
            $set: { updated_time: new Date() }
        }, { upsert: true },
        function (err, numberAffected) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            db.Game.findById(tokenInfo.gameId, function (err, doc) {
                if (err) {
                    logger.error(err);
                    return callback({ result: RESULT_SYSTEM_ERROR });
                }
                db.Player.findById(game.roundPlayerId, function (err, player) {
                    if (err) {
                        logger.error(err);
                        return callback({ result: RESULT_SYSTEM_ERROR });
                    }
                    var playerName = player ? player.name : '';
                    client.join(tokenInfo.gameId);
                    callback({
                        result:     RESULT_OK,
                        answer:     doc.answer,
                        round:      game.round + 1,
                        roundMax:   game.roundMax,
                        playerName: playerName,
                        image:      game.imagelog,
                    });
                });
            });
        });
    });

    /**
     * ページ表示後の初期化(解答)
     */
    client.on('init answer', function (data, callback) {
        'use strict';
        logger.debug('init answer : ' + client.id);
        logger.trace(data);

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.token)) {
            logger.warn('init answer : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var tokenInfo = tokens[data.token];
        delete(tokens[data.token]);

        if (isUndefinedOrNull(tokenInfo) ||
            !checkToken(data.token, tokenInfo, AUTHORITY_TYPE_ANSWER_ENTER)) {
            logger.warn('init answer : ' + client.id + ' : ' + RESULT_INVALID_TOKEN);
            return callback({ result: RESULT_INVALID_TOKEN });
        }

        var endGame = endGames[tokenInfo.gameId];
        if (isUndefinedOrNull(endGame)) {
            logger.error('game not exists. gameId: ' + tokenInfo.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        var playLog = new db.PlayLog();
        playLog.game_id         = tokenInfo.gameId;
        playLog.player_id       = tokenInfo.playerId;
        playLog.role            = ROLE_ANSWER;
        playLog.registered_time = new Date();
        playLog.updated_time    = new Date();
        playLog.save(function (err) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            var newToken = uuid.v4().replace(/-/g, '');

            tokens[newToken] = {
                gameId:        tokenInfo.gameId,
                authorityType: AUTHORITY_TYPE_ANSWER_SEND_ANSWER,
                expire:        new Date().getTime() + 1000 * (endGame.answerTime + TOKEN_EXPIRED_TIME_BUFFER),
                playerId:      tokenInfo.playerId,
            };
            db.Game.findById(tokenInfo.gameId, function (err, doc) {
                if (err) {
                    logger.error(err);
                    return callback({ result: RESULT_SYSTEM_ERROR });
                }
                callback({
                    result:     RESULT_OK,
                    token:      newToken,
                    fileName:   doc.rounds[doc.rounds.length - 1].file_name,
                    answerTime: endGame.answerTime,
                });
            });
        });
    });

    /**
     * ページ表示後の初期化(結果)
     */
    client.on('init result', function (data, callback) {
        'use strict';
        logger.debug('init result : ' + client.id);
        logger.trace(data);

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.token)) {
            logger.warn('init result : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var tokenInfo = tokens[data.token];
        delete(tokens[data.token]);

        if (isUndefinedOrNull(tokenInfo) ||
            !checkToken(data.token, tokenInfo, AUTHORITY_TYPE_LIST_ENTER)) {
            logger.warn('init result : ' + client.id + ' : ' + RESULT_INVALID_TOKEN);
            return callback({ result: RESULT_INVALID_TOKEN });
        }

        var endGame = endGames[tokenInfo.gameId];
        if (isUndefinedOrNull(endGame)) {
            logger.error('game not exists. gameId: ' + tokenInfo.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        db.PlayLog.update({
            game_id:   tokenInfo.gameId,
            player_id: tokenInfo.playerId,
            role:      ROLE_LIST,
        }, {
            $setOnInsert: {
                game_id:         tokenInfo.gameId,
                player_id:       tokenInfo.playerId,
                role:            ROLE_LIST,
                registered_time: new Date(),
            },
            $set: { updated_time: new Date() }
        }, { upsert: true },
        function (err, numberAffected) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            db.Game.findById(tokenInfo.gameId, function (err, doc) {
                if (err) {
                    logger.error(err);
                    return callback({ result: RESULT_SYSTEM_ERROR });
                }

                var files = [];
                doc.rounds.forEach(function (round) {
                    files.push({
                        fileName: round.file_name,
                    });
                });

                // hack : とりあえず最新20件に制限
                var otherAnswers = [];
                var query = db.Answer.find({ game_id: tokenInfo.gameId })
                                     .limit(20)
                                     .sort({ registered_time: 'desc' });
                query.exec(function (err, docs) {
                    if (err) {
                        logger.error(err);
                        return callback({ result: RESULT_SYSTEM_ERROR });
                    }
                    docs.forEach(function (doc) {
                        otherAnswers.push(doc.answer);
                    });

                    callback({
                        result:       RESULT_OK,
                        gameId:       doc._id,
                        answer:       doc.answer,
                        otherAnswers: otherAnswers,
                        files:        files,
                    });
                });
            });
        });
    });

    /**
     * プレイヤー名取得API
     */
    client.on('get player name', function (data, callback) {
        'use strict';
        logger.debug('get player name : ' + client.id);
        logger.trace(data);

        if (isUndefinedOrNull(data)        ||
            isUndefinedOrNull(data.gameId) ||
            isUndefinedOrNull(data.round)) {
            logger.warn('get player name : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        db.Game.findById(data.gameId, function (err, game) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }

            var round = game.rounds[data.round - 1];
            if (isUndefinedOrNull(round)) {
                logger.warn('get player name : ' + client.id + ' : ' + RESULT_BAD_PARAM);
                return callback({ result: RESULT_BAD_PARAM });
            }

            if (isUndefinedOrNull(round.drawer_id)) {
                return callback({ result: RESULT_SYSTEM_ERROR });
            }

            db.Player.findById(round.drawer_id, function (err, player) {
                if (err) {
                    logger.error(err);
                    return callback({ result: RESULT_SYSTEM_ERROR });
                }

                callback({
                    result:     RESULT_OK,
                    playerName: player.name,
                });
            });
        });
    });

    /**
     * ゲーム一覧取得API
     */
    client.on('request game list', function () {
        'use strict';
        logger.debug('request game list : ' + client.id);
        
        sendGameList(client);
    });

    /**
     * ゲーム中断
     */
    client.on('exit game', function (data, callback) {
        'use strict';
        logger.debug('exit game : ' + client.id);
        logger.trace(data);

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.token)) {
            logger.warn('exit game : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var tokenInfo = tokens[data.token];
        delete(tokens[data.token]);

        if (isUndefinedOrNull(tokenInfo) ||
            !checkToken(data.token, tokenInfo, AUTHORITY_TYPE_DRAW_SEND_IMAGE)) {
            logger.warn('exit game : ' + client.id + ' : ' + RESULT_INVALID_TOKEN);
            return callback({ result: RESULT_INVALID_TOKEN });
        }

        var game = games[tokenInfo.gameId];
        if (isUndefinedOrNull(game)) {
            logger.error('game not exists. gameId: ' + tokenInfo.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        game.roundToken = null;
        game.roundPlayerId = null;
        return callback({ result: RESULT_OK });
    });

    /**
     * 描いた絵を受け取る
     */
    client.on('send image', function (data, callback) {
        'use strict';
        logger.debug('send image : ' + client.id);
        logger.trace(data);

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.token)) {
            logger.warn('send image : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var tokenInfo = tokens[data.token];
        delete(tokens[data.token]);

        if (isUndefinedOrNull(tokenInfo) ||
            !checkToken(data.token, tokenInfo, AUTHORITY_TYPE_DRAW_SEND_IMAGE)) {
            logger.warn('send image : ' + client.id + ' : ' + RESULT_INVALID_TOKEN);
            return callback({ result: RESULT_INVALID_TOKEN });
        }

        var game = games[tokenInfo.gameId];
        if (isUndefinedOrNull(game)) {
            logger.error('game not exists. gameId: ' + tokenInfo.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        // 画像を保存
        saveImage(data.png, data.thumbnailPng, function (imageFileName) {
            if (!imageFileName) {
                logger.error('save image failed : ' + client.id + ' : gameId : ' + tokenInfo.gameId);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }

            // DBにround情報を登録
            var round = new db.Round();
            round.round = game.round + 1;
            round.drawer_id = tokenInfo.playerId;
            round.file_name = imageFileName;
            round.like_count = 0;
            round.registered_time = new Date();
            round.updated_time = round.registered_time;

            db.Game.findById(game.id, function (err, doc) {
                if (err) {
                    logger.error(err);
                    return callback({ result: RESULT_SYSTEM_ERROR });
                }
                doc.rounds.push(round);
                doc.updated_time = new Date();
                if (doc.round_max <= doc.rounds.length) doc.is_gameover = true;
                doc.save(function (err) {
                    if (err) {
                        logger.error(err);
                        return callback({ result: RESULT_SYSTEM_ERROR });
                    }

                    // メモリ上のゲーム情報を更新
                    game.round += 1;
                    game.roundToken = null;
                    game.roundPlayerId = null;
                    if (game.roundMax <= game.round) {
                        delete(games[tokenInfo.gameId]);
                        endGames[tokenInfo.gameId] = game;
                    }
                    noticeGameUpdate();

                    return callback({ result: RESULT_OK });
                });
            });            
        });
    });

    /**
     * 描いている絵を受け取る（描く->見物）
     */
    client.on('send drawing image', function (data) {
        'use strict';
        logger.debug('send drawing image : ' + client.id);
        logger.trace(data);

        // お絵かきの共有に失敗してもゲームの進行は止めたくないので、
        // このメソッド内のエラーはclientにcallbackで返さない。

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.token)) {
            logger.warn('send drawing image : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return;
        }

        var tokenInfo = tokens[data.token];

        if (isUndefinedOrNull(tokenInfo) ||
            !checkToken(data.token, tokenInfo, AUTHORITY_TYPE_DRAW_SEND_IMAGE)) {
            logger.warn('send drawing image : ' + client.id + ' : ' + RESULT_INVALID_TOKEN);
            return;
        }

        var game = games[tokenInfo.gameId];
        if (isUndefinedOrNull(game)) {
            logger.error('game not exists. gameId: ' + tokenInfo.gameId);
            return;
        }

        game.storeImage(data.drawingImage);
        client.broadcast.to(tokenInfo.gameId).emit('push drawing image', data.drawingImage);
    });

    /**
     * Canvasのクリア（描く->見物）
     */
    client.on('clear canvas', function (data) {
        'use strict';
        logger.debug('clear canvas : ' + client.id);
        logger.trace(data);

        // お絵かきの共有に失敗してもゲームの進行は止めたくないので、
        // このメソッド内のエラーはclientにcallbackで返さない。

        if (isUndefinedOrNull(data) || isUndefinedOrNull(data.token)) {
            logger.warn('clear canvas : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return;
        }

        var tokenInfo = tokens[data.token];

        if (isUndefinedOrNull(tokenInfo) ||
            !checkToken(data.token, tokenInfo, AUTHORITY_TYPE_DRAW_SEND_IMAGE)) {
            logger.warn('clear canvas : ' + client.id + ' : ' + RESULT_INVALID_TOKEN);
            return;
        }

        var game = games[tokenInfo.gameId];
        if (isUndefinedOrNull(game)) {
            logger.error('game not exists. gameId: ' + tokenInfo.gameId);
            return;
        }

        game.deleteImage();
        client.broadcast.to(tokenInfo.gameId).emit('push clear canvas');
    });

    /**
     * 解答を受け取る
     */
    client.on('send answer', function (data, callback) {
        'use strict';
        logger.debug('send answer : ' + client.id);
        logger.trace(data);

        if (isUndefinedOrNull(data)       ||
            isUndefinedOrNull(data.token) ||
            isUndefinedOrNull(data.answer)) {
            logger.warn('send answer : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var playerAnswer = data.answer.trim();
        if (!checkParamLength(playerAnswer, 0, ANSWER_LENGTH_MAX)) {
            logger.warn('send answer : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
        }

        var tokenInfo = tokens[data.token];
        delete(tokens[data.token]);

        if (isUndefinedOrNull(tokenInfo) ||
            !checkToken(data.token, tokenInfo, AUTHORITY_TYPE_ANSWER_SEND_ANSWER)) {
            logger.warn('send answer : ' + client.id + ' : ' + RESULT_INVALID_TOKEN);
            return callback({ result: RESULT_INVALID_TOKEN });
        }

        var endGame = endGames[tokenInfo.gameId];
        if (isUndefinedOrNull(endGame)) {
            logger.error('game not exists. gameId: ' + tokenInfo.gameId);
            return callback({ result: RESULT_SYSTEM_ERROR });
        }

        // 解答を保存
        var answer = new db.Answer();
        answer.game_id = tokenInfo.gameId;
        answer.answerer_id = tokenInfo.playerId;
        answer.answer = playerAnswer;
        answer.registered_time = new Date();
        answer.save(function (err) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }

            callback({
                result: RESULT_OK,
                answer: endGame.answer,
            });
        });
    });

    // いいね？API
    client.on('send good', function (data, callback) {
        // paramチェック
        // playerIdチェック
        // 多重いいね防止
        // 自分の絵は不可
        // rating登録(db)
    });

    /**
     * socket切断時の処理
     */
    client.on('disconnect', function () {
        'use strict';
        logger.debug('disconnect : ' + client.id);

        globalUserCount -= 1;
    });
};

//------------------------------
// メソッド定義
//------------------------------

/**
 * PlaylogにRoleが含まれているかチェック
 */
function playlogContainsRole(playlogs, role) {
    'use strict';
    logger.debug('playlogContainsRole');

    return playlogs.some(function (log) {
        return log.role === role;
    });
}

/**
 * 進行中のゲーム一覧の取得
 */
function getGameList () {
    'use strict';
    logger.debug('getGameList');

    var gameList = [];
    var keys = Object.keys(games);
    for (var i = keys.length - 1; 0 <= i; i -= 1) {
        var game = games[keys[i]];
        gameList.push({
            id:       game.id,
            name:     escapeHTML(game.name),
            comment:  escapeHTML(game.comment),
            password: !!game.password,
            round:    game.round,
            roundMax: game.roundMax,
        });
    }
    return gameList;
}

/**
 * 終了したゲーム一覧の取得
 */
function getEndGameList () {
    'use strict';
    logger.debug('getEndGameList');

    var gameList = [];
    var keys = Object.keys(endGames);
    // hack : とりあえず最新50件のみ表示
    var limit = Math.max(0, keys.length - 50);
    for (var i = keys.length - 1; limit <= i; i -= 1) {
        var game = endGames[keys[i]];
        gameList.push({
            id:       game.id,
            name:     escapeHTML(game.name),
            comment:  escapeHTML(game.comment),
            roundMax: game.roundMax,
        });
    }
    return gameList;
}

/**
 * ゲーム一覧に更新があったことをブロードキャストで通知する
 */
function noticeGameUpdate() {
    'use strict';
    logger.debug('noticeGameUpdate');

    server.sockets.to(INDEX_ROOM).emit('notice game update');
}

/**
 * ゲーム一覧をクライアントに送る
 */
function sendGameList (client) {
    'use strict';
    logger.debug('sendGameList');

    var data = {
        gameList:    getGameList(),
        endGameList: getEndGameList(),
    };
    client.emit('send game list', data);
}

/**
 * トークンチェック
 */
function checkToken (token, tokenInfo, expectedAuthorityType) {
    'use strict';
    logger.debug('checkToken');

    if (!tokenInfo) {
        logger.warn('token not exists : ' + token);
        return false;
    }

    if (tokenInfo.authorityType !== expectedAuthorityType) {
        logger.warn('token invalid type : ' + tokenInfo.authorityType + ' (expected : ' + expectedAuthorityType + ')');
        return false;
    }

    var now = new Date().getTime();
    if (tokenInfo.expire < now) {
        logger.warn('token expired : ' + token + ' ' + now + ' (limit : ' + tokenInfo.expire + ')');
        return false;
    }

    return true;
}

/**
 * 画像をファイルに保存
 */
function saveImage (png, thumbnailPng, callback) {
    'use strict';
    logger.debug('saveImage');

    if (!png || !thumbnailPng) return callback(null);

    // todo : PNGフォーマットチェック

    var filename = new Date().getTime();

    // 原寸の画像を保存
    var buf = new Buffer(png, 'base64');
    var path = './public/log/' + filename + '.png';
    fs.writeFile(path, buf, function (err) {
        if (err) {
            logger.error(err);
            return callback(null);
        }

        // サムネイル画像を保存
        buf = new Buffer(thumbnailPng, 'base64');
        path = './public/log/thumb/' + filename + '.thumb.png';
        fs.writeFile(path, buf, function (err) {
            if (err) {
                logger.error(err);
                return callback(null);
            }
            callback(filename);
        });
    });
}

/**
 * HTMLエスケープ処理
 */
function escapeHTML(str) {
    'use strict';

    // hack : 抜けている文字がないかチェック
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * nullとundefinedのチェック
 */
function isUndefinedOrNull(data) {
    'use strict';

    return typeof data === 'undefined' || data === null;
}

/**
 * 文字数のチェック
 */
function checkParamLength(data, minLength, maxLength) {
    'use strict';

    return minLength <= data.length && data.length <= maxLength;
}

/**
 * 範囲のチェック
 */
function checkParamSize(data, minSize, maxSize) {
    'use strict';

    return minSize <= data && data <= maxSize;
}
