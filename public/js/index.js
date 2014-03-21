(function () {
    'use strict';

    var RESULT_OK            = 'ok';
    var RESULT_BAD_PARAM     = 'bad param';
    var RESULT_PASSWORD_NG   = 'password ng';
    var RESULT_GAME_FULL     = 'game full';
    var RESULT_CREATE_MAX    = 'create max';
    var RESULT_CREATED_GAME  = 'created game';
    var RESULT_PLAYED_GAME   = 'played game';
    var RESULT_WATCHED_GAME  = 'watched game';
    var RESULT_ANSWERED_GAME = 'answered game';
    var RESULT_RESULT_VIEWED = 'result viewed';
    var RESULT_NOW_PLAYING   = 'now playing';
    var RESULT_CANNOT_ANSWER = 'cannot answer';

    var KEY_PLAYER_ID   = 'playerId';
    var KEY_PLAYER_NAME = 'playerName';
    var KEY_TOKEN       = 'token';

    var socket;
    var playerId;
    var playerName;
    var isProcessing = true;

    var ANSWER_LENGTH_MAX;
    var GAME_NAME_LENGTH_MAX;
    var COMMENT_LENGTH_MAX;

    $(document).ready(function () {
        // console.log('ready');

        ANSWER_LENGTH_MAX    = Number($('#newGameAnswer').attr('maxlength'));
        GAME_NAME_LENGTH_MAX = Number($('#newGameName').attr('maxlength'));
        COMMENT_LENGTH_MAX   = Number($('#newGameComment').attr('maxlength'));

        socket = io.connect();

        //------------------------------
        // メッセージハンドラ定義
        //------------------------------

        /**
         * 接続成功
         */
        socket.on('connected', function () {
            'use strict';
            // console.log('connected');

            playerId = window.localStorage.getItem(KEY_PLAYER_ID);
            playerName = window.localStorage.getItem(KEY_PLAYER_NAME);
            socket.emit('init index', { playerId: playerId, playerName: playerName }, function (data) {
                if (data.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                    return;
                } else if (data.result === RESULT_OK) {
                    if (data.playerId) {
                        window.localStorage.setItem(KEY_PLAYER_ID, data.playerId);
                        playerId = data.playerId;
                    }
                    window.localStorage.setItem(KEY_PLAYER_NAME, data.playerName);
                    playerName = data.playerName;
                    $('#playerName').val(playerName);
                    // console.log('playerId: ' + playerId);
                    // console.log('playerName: ' + playerName);
                    isProcessing = false;
                } else {
                    alert('予期しないエラーです');
                    return;
                }
            });
        });

        /**
         * 進行中のゲーム一覧を受け取る
         */
        socket.on('send game list', function (data) {
            'use strict';
            // console.log('send game list');

            $('.updateGameList').attr('disabled', 'disabled');
            $('.updateGameList').removeClass('btn-primary');
            $('.updateGameList').addClass('btn-default');

            updateGameList(data.gameList);
            updateEndGameList(data.endGameList);
        });

        /**
         * ゲーム情報の更新通知
         */
        socket.on('notice game update', function () {
            'use strict';
            // console.log('notice game update');

            $('.updateGameList').removeAttr('disabled');
            $('.updateGameList').removeClass('btn-default');
            $('.updateGameList').addClass('btn-primary');
        });

        //------------------------------
        // イベントハンドラ定義
        //------------------------------

        /**
         * プレイヤー名変更
         */
        $('#playerName').change(function () {
            'use strict';
            // console.log('#playerName change');

            var name = $('#playerName').val();
            socket.emit('update name', { playerName: name }, function (data) {
                if (data.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (data.result === RESULT_OK) {
                    // hack : 成功を通知する
                    window.localStorage.setItem(KEY_PLAYER_NAME, data.playerName);
                    playerName = data.playerName;
                    $('#playerName').val(playerName);
                    // console.log('playerName: ' + playerName);
                } else {
                    alert('予期しないエラーです');
                }
            });
        });

        /**
         * ゲーム作成リクエスト
         */
        $('#startButton').on('click', function () {
            'use strict';
            if (isProcessing) return;
            isProcessing = true;
            // console.log('#startButton click');

            // hack : もう少しきれいに
            var answer   = $('#newGameAnswer').val().trim();
            var gameName = $('#newGameName').val().trim();
            var comment  = $('#newGameComment').val().trim();
            if (answer.length === 0) {
                alert('お題を入力してください');
                isProcessing = false;
                return;
            } else if (answer.length > ANSWER_LENGTH_MAX) {
                alert('お題が長過ぎます');
                isProcessing = false;
                return;
            } else if (gameName.length > GAME_NAME_LENGTH_MAX) {
                alert('ゲーム名が長過ぎます');
                isProcessing = false;
                return;
            } else if (comment.length > COMMENT_LENGTH_MAX) {
                alert('コメントが長過ぎます');
                isProcessing = false;
                return;
            }

            var game = {
                answer:     answer,
                name:       gameName,
                // round:      $('#newGameRound').val(),
                // viewTime:   $('#newGameViewTime').val(),
                // drawTime:   $('#newGameDrawTime').val(),
                // answerTime: $('#newGameAnswerTime').val(),
                comment:    comment,
                // password:   $('#newGamePassword').val(),
            };

            socket.emit('start game', game, function (data) {
                // console.log('start game callback');
                // console.log(data);
                if (data.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (data.result === RESULT_GAME_FULL) {
                    alert('一度に進行可能なゲームは20件までです');
                } else if (data.result === RESULT_CREATE_MAX) {
                    // hack : 仮の件数
                    alert('一度に作成可能なゲームは2件までです');
                } else if (data.result === RESULT_OK) {
                    $('#newGameName').val('');
                    $('#newGameAnswer').val('');
                    // $('#newGameRound').val('');
                    // $('#newGameViewTime').val('');
                    // $('#newGameDrawTime').val('');
                    // $('#newGameAnswerTime').val('');
                    $('#newGameComment').val('');
                    // $('#newGamePassword').val('');

                    socket.emit('request game list');
                } else {
                    alert('予期しないエラーです');
                }
                isProcessing = false;
            });
        });

        /**
         * ゲーム参加リクエスト（描く）
         */
        $(document).on('click', '#draw', function () {
            'use strict';
            if (isProcessing) return;
            isProcessing = true;
            // console.log('#draw click');

            var credentials = {
                gameId:   $(this).parent().parent().attr('id'),
                password: $(this).parent().parent().find('#joinGamePassword').val(),
            };

            socket.emit('request for draw', credentials, function (data) {
                // console.log('request for draw callback');
                // console.log(data);
                if (data.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (data.result === RESULT_CREATED_GAME) {
                    alert('自分が作ったゲームには最初のラウンド以外参加できません');
                } else if (data.result === RESULT_PLAYED_GAME) {
                    alert('参加済のゲームです');
                } else if (data.result === RESULT_WATCHED_GAME) {
                    alert('見物したゲームには参加できません');
                } else if (data.result === RESULT_PASSWORD_NG) {
                    alert('パスワードが違います');
                } else if (data.result === RESULT_NOW_PLAYING) {
                    alert('誰かがプレイ中です');
                } else if (data.result === RESULT_OK) {
                    window.localStorage.setItem(KEY_TOKEN, data.token);

                    var dom = $('<a />');
                    dom.addClass('iframe cboxElement');
                    dom.attr('href', '/draw');
                    dom.css('display', 'none');
                    dom.colorbox({
                        iframe: true,
                        innerWidth: '740px',
                        innerHeight: '680px',
                        transition: 'none',
                        closeButton: false,
                        open: true,
                        overlayClose: false,
                        escKey: false,
                    });
                }
                else {
                    alert('予期しないエラーです');
                }
                isProcessing = false;
            });
        });

        /**
         * ゲーム参加リクエスト（見物）
         */
        $(document).on('click', '#watch', function () {
            'use strict';
            if (isProcessing) return;
            isProcessing = true;
            // console.log('#watch click');

            var credentials = {
                gameId:   $(this).parent().parent().attr('id'),
                password: $(this).parent().parent().find('#joinGamePassword').val(),
            };

            socket.emit('request for watch', credentials, function (data) {
                // console.log('request for watch callback');
                // console.log(data);
                if (data.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (data.result === RESULT_PASSWORD_NG) {
                    alert('パスワードが違います');
                } else if (data.result === RESULT_OK) {
                    window.localStorage.setItem(KEY_TOKEN, data.token);

                    var dom = $('<a />');
                    dom.addClass('iframe cboxElement');
                    dom.attr('href', '/watch');
                    dom.css('display', 'none');
                    dom.colorbox({
                        iframe: true,
                        innerWidth: '740px',
                        innerHeight: '680px',
                        transition: 'none',
                        closeButton: false,
                        open: true,
                        // overlayClose: false,
                        // escKey: false,
                    });
                }
                else {
                    alert('予期しないエラーです');
                }
                isProcessing = false;
            });
        });

        /**
         * ゲーム参加リクエスト（解答）
         */
        $(document).on('click', '#answer', function () {
            'use strict';
            if (isProcessing) return;
            isProcessing = true;
            // console.log('#answer click');

            var credentials = {
                gameId: $(this).parent().parent().attr('id'),
            };

            socket.emit('request for answer', credentials, function (data) {
                // console.log(data);
                if (data.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (data.result === RESULT_CREATED_GAME) {
                    alert('自分が作ったゲームには解答できません');
                } else if (data.result === RESULT_PLAYED_GAME) {
                    alert('参加したゲームには解答できません');
                } else if (data.result === RESULT_WATCHED_GAME) {
                    alert('見物したゲームには解答できません');
                } else if (data.result === RESULT_ANSWERED_GAME) {
                    alert('解答済のゲームです');
                } else if (data.result === RESULT_RESULT_VIEWED) {
                    alert('結果を見たゲームには解答できません');
                } else if (data.result === RESULT_OK) {
                    window.localStorage.setItem(KEY_TOKEN, data.token);

                    var dom = $('<a />');
                    dom.addClass('iframe cboxElement');
                    dom.attr('href', '/answer');
                    dom.css('display', 'none');
                    dom.colorbox({
                        iframe: true,
                        innerWidth: '740px',
                        innerHeight: '680px',
                        transition: 'none',
                        closeButton: false,
                        open: true,
                        overlayClose: false,
                        escKey: false,
                    });
                }
                else {
                    alert('予期しないエラーです');
                }
                isProcessing = false;
            });
        });

        /**
         * ゲーム参加リクエスト（結果）
         */
        $(document).on('click', '#result', function () {
            'use strict';
            if (isProcessing) return;
            isProcessing = true;
            // console.log('#result click');

            var credentials = {
                gameId: $(this).parent().parent().attr('id'),
            };

            socket.emit('request for result', credentials, function (data) {
                // console.log('request for result callback');
                // console.log(data);
                if (data.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (data.result === RESULT_OK) {
                    window.localStorage.setItem(KEY_TOKEN, data.token);

                    var dom = $('<a />');
                    dom.addClass('iframe cboxElement');
                    dom.attr('href', '/result');
                    dom.css('display', 'none');
                    dom.colorbox({
                        iframe: true,
                        innerWidth: '740px',
                        innerHeight: '680px',
                        transition: 'none',
                        closeButton: false,
                        open: true,
                        // overlayClose: false,
                        // escKey: false,
                    });
                }
                else {
                    alert('予期しないエラーです');
                }
                isProcessing = false;
            });
        });

        /**
         * ゲーム一覧更新リクエスト
         */
        $('.updateGameList').on('click', function () {
            'use strict';
            // console.log('.updateGameList click');

            socket.emit('request game list');
        });

        //------------------------------
        // その他
        //------------------------------

        /**
         * 進行中のゲーム一覧を表示する
         */
        function updateGameList (gameList) {
            // hack : 整形
            $('#gameList tbody').empty();
            var html = '';
            for (var i = 0; i < gameList.length; i += 1) {
                var game = gameList[i];
                html += '<tr id="' + game.id + '">';
                html += '<td id="name">' + game.name + '</td>';
                // if (game.password) {
                //     html += '<td id="password"><input id="joinGamePassword" class="form-control" type="text" placeholder="パスワードを入力..."></input></td>';
                // } else {
                //     html += '<td id="password">-</td>';
                // }
                html += '<td>' + (game.round + 1) + ' / ' + game.roundMax + '</td>';
                html += '<td>' + game.comment + '</td>';
                html += '<td><button id="draw" class="btn btn-primary">参加する</input></td>';
                html += '<td><button id="watch" class="btn btn-primary">見物する</input></td>';
                html += '</tr>';
            }
            $('#gameList tbody').append(html);
        }

        /**
         * 終了したゲーム一覧を表示する
         */
        function updateEndGameList (gameList) {
            // hack : 整形
            $('#endGameList tbody').empty();
            var html = '';
            for (var i = 0; i < gameList.length; i += 1) {
                var game = gameList[i];
                html += '<tr id="' + game.id + '">';
                html += '<td id="name">' + game.name + '</td>';
                html += '<td>' + game.roundMax + '</td>';
                html += '<td>' + game.comment + '</td>';
                html += '<td><button id="answer" class="btn btn-primary">解答する</input></td>';
                html += '<td><button id="result" class="btn btn-primary">結果を見る</input></td>';
                html += '</tr>';
            }
            $('#endGameList tbody').append(html);
        }
    });
})();
