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
        var timer;
        var timeLeft;

        var canvas = $('#drawCanvas').get(0);
        var context = canvas.getContext('2d');

        var isOperable = false;

        var token;
        var fileName;
        var answerTime;

        //------------------------------
        // 準備
        //------------------------------

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

            socket.emit('init answer', data, function (res) {
                // console.log('init answer callback');
                // console.log(data);

                if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                    windowClose();
                } else if (res.result === RESULT_INVALID_TOKEN) {
                    alert('不正なトークンです');
                    windowClose();
                } else if (res.result === RESULT_OK) {
                    token = res.token;
                    fileName = res.fileName;
                    answerTime = res.answerTime;
                    initCountDown();
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
         * 送信ボタン クリックイベント
         */
        $('#answerDone').on('click', function (e) {
            'use strict';
            // console.log('#answerDone click');
            e.stopPropagation();

            timeLeft = 0;
            countDown();
        });

        /**
         * 中断ボタン クリックイベント
         */
        $('#exit').on('click', function (e) {
            'use strict';
            // console.log('#exit click');
            e.stopPropagation();

            clearInterval(timer);

            var data = { token: token };
            socket.emit('exit game', data, function () {});
            alert('ゲームを中断しました');
            windowClose();
        });

        //------------------------------
        // 関数
        //------------------------------

        /**
         * カウントダウン開始
         */
        function initCountDown () {
            'use strict';
            // console.log('initCountDown');

            timeLeft = answerTime;
            dispTimeLeft();

            var image = new Image();
            image.src = '/log/' + fileName + '.png?' + new Date().getTime();
            image.onload = function () {
                // hack : alertだとカウントダウンが止まるので対策が必要
                var message = '何の絵か当ててください\n\n';
                message += '制限時間： ' + answerTime + ' 秒';
                alert(message);

                context.drawImage(image, 0, 0);

                timer = setInterval(countDown, 1000);
            };
        }

        /**
         * カウントダウン中の処理
         */
        function countDown () {
            'use strict';
            // console.log('countDown');

            timeLeft = timeLeft - 1;
            dispTimeLeft();

            if (timeLeft > 0) return;

            isOperable = false;
            clearInterval(timer);

            var answer = $('#answer').val().trim();
            var data = {
                token:  token,
                answer: answer,
            };
            socket.emit('send answer', data, function (res) {
                'use strict';
                // console.log('send answer callback');

                if (res.result === RESULT_OK) {
                    var message = '解答を送信しました\n\n';
                    message += '答えは「' + res.answer + '」でした';
                    alert(message);
                } else if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (res.result === RESULT_INVALID_TOKEN) {
                    alert('不正なトークンです');
                } else {
                    alert('予期しないエラーです');
                }
                windowClose();
            });
        }

        /**
         * 残り時間表示
         */
        function dispTimeLeft () {
            'use strict';
            // console.log('dispTimeLeft');

            $('#timeLeft label').text('残り時間 ： ' + (timeLeft >= 0 ? timeLeft : 0) + ' 秒');
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
