(function () {
    'use strict';

    $(document).ready(function () {
        'use strict';

        //------------------------------
        // 定数
        //------------------------------

        var RESULT_OK            = 'ok';
        var RESULT_BAD_PARAM     = 'bad param';
        var RESULT_INVALID_TOKEN = 'invalid token';
    
        var KEY_TOKEN = 'token';

        //------------------------------
        // 変数
        //------------------------------

        var socket;

        var canvas = $('#drawCanvas').get(0);
        var context = canvas.getContext('2d');

        var isOperable = false;

        var gameId;
        var answer;
        var otherAnswers;
        var files;
        var now;

        //------------------------------
        // 準備
        //------------------------------

        $('#showOtherAnswers').css('display', 'none');

        if (!canvas.getContext) {
            alert('ブラウザがCanvasに対応してないよ(´・ω・｀)');
            windowClose();
        }

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, $('#drawCanvas').width(), $('#drawCanvas').height());

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

            var data = { token: window.localStorage.getItem(KEY_TOKEN) };
            window.localStorage.removeItem(KEY_TOKEN);

            socket.emit('init result', data, function (res) {
                // console.log('init result callback');
                // console.log(data);

                if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                    windowClose();
                } else if (res.result === RESULT_INVALID_TOKEN) {
                    alert('不正なトークンです');
                    windowClose();
                } else if (res.result === RESULT_OK) {
                    gameId       = res.gameId;
                    answer       = res.answer;
                    otherAnswers = res.otherAnswers;
                    files        = res.files;
                    now = 0;
                    showImage();
                } else {
                    alert('予期しないエラーです');
                    windowClose();
                }
            });
        });

        //------------------------------
        // その他 イベントハンドラ
        //------------------------------

        /**
         * 答えを見るボタン クリックイベント
         */
        $('#showAnswer').on('click', function (e) {
            'use strict';
            // console.log('#answer click');
            e.stopPropagation();

            $('#showAnswer').css('display', 'none');
            $('#showOtherAnswers').css('display', '');
            $('#answer').text('答え ： ' + answer);
        });

        /**
         * みんなの解答を見るボタン クリックイベント
         */
        $('#showOtherAnswers').on('click', function (e) {
            'use strict';
            console.log('#showOtherAnswers click');
            e.stopPropagation();

            if (otherAnswers.length === 0) {
                alert('まだ解答はありません');
            } else {
                var message = 'みんなの解答\n';
                otherAnswers.forEach(function (answer) {
                    message += '\n' + answer;
                });
                alert(message);
            }
        });

        /**
         * ＞ボタン クリックイベント
         */
        $('#next').on('click', function (e) {
            'use strict';
            // console.log('#next click');
            e.stopPropagation();

            if (now < files.length - 1) {
                now += 1;
                showImage();
            }
        });

        /**
         * ＜ボタン クリックイベント
         */
        $('#previous').on('click', function (e) {
            'use strict';
            // console.log('#previous click');
            e.stopPropagation();

            if (0 < now) {
                now -= 1;
                showImage();
            }
        });

        /**
         * 戻るボタン クリックイベント
         */
        $('#exit').on('click', function (e) {
            'use strict';
            // console.log('#exit click');
            e.stopPropagation();

            windowClose();
        });

        //------------------------------
        // 関数
        //------------------------------

        /**
         * 画像表示
         */
        function showImage () {
            'use strict';
            // console.log('showImage');

            isOperable = false;
            var image = new Image();
            image.src = '/log/' + files[now].fileName + '.png';
            image.onload = function () {
                var data = {
                    gameId: gameId,
                    round: now + 1,
                };
                socket.emit('get player name', data, function (res) {
                    // console.log('get player name callback');
                    // console.log(res);

                    var playerName = res.result === RESULT_OK ? res.playerName : '不明';
                    $('#round').text(now + 1 + ' / ' + files.length);
                    $('#drawer').text('描いた人 ： ' + playerName);
                    context.drawImage(image, 0, 0);
                    isOperable = true;
                });
            };
        }

        /**
         * windowを閉じる
         */
        function windowClose () {
            'use strict';
            // console.log('windowClose');

            parent.$.fn.colorbox.close();
        }
    });
})();
