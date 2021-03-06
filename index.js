
'use strict';

(() => {

    const
        SSH   = require('simple-ssh'),
        slack = require('slack');

    const
        SSH_USER = (() => {
            if (!process.env.SSH_USER) {
                throw new Error('SSH_USER is needed');
            }
            return process.env.SSH_USER;
        })(),

        SSH_HOST = (() => {
            if (!process.env.SSH_HOST) {
                throw new Error('SSH_HOST is needed');
            }
            return process.env.SSH_HOST;
        })(),

        SSH_PASSWORD = (() => {
            if (!process.env.SSH_PASSWORD) {
                console.log('No SSH_PASSWORD provided');
            }
            return process.env.SSH_PASSWORD;
        })(),

        SSH_KEY = (() => {
            if (!process.env.SSH_KEY) {
                console.log('No SSH_KEY provided');
            }
            return process.env.SSH_KEY;
        })(),

        SSH_PREFIX_CMD = (() => {
            if (!process.env.SSH_PREFIX_CMD) {
                console.log('No SSH_PREFIX_CMD provided');
                return '';
            }
            return process.env.SSH_PREFIX_CMD + ' ';
        })(),

        SSH_TIMEOUT = (() => {
            if (!process.env.SSH_TIMEOUT) {
                return 4;
            }
            return parseInt(process.env.SSH_TIMEOUT, 10);
        })(),

        SLACK_API_TOKEN = (() => {
            if (!process.env.SLACK_API_TOKEN) {
                throw new Error('SLACK_API_TOKEN is needed');
            }
            return process.env.SLACK_API_TOKEN;
        })();

    const
        bot = slack.rtm.client(),
        ssh = new SSH({
            host: SSH_HOST,
            user: SSH_USER,
            pass: SSH_PASSWORD,
            key:  SSH_KEY,
        });

    ssh.on('error', (err) => {
        ssh.end();
        throw new Error(err);
    });

    const
        sendMessage = (code, text, channel) => {

            let color = code ? 'danger' : 'good';

            slack.chat.postMessage({
                token:       SLACK_API_TOKEN,
                channel:     channel,
                as_user:     true,
                text:        '',
                attachments: [{
                    fallback:    text,
                    author_name: `Status: ${code}`,
                    footer:      `${SSH_USER}@${SSH_HOST}`,
                    color:       color,
                    text:        text,
                    ts:          Math.floor(Date.now() / 1000),
                }],
            }, (err) => {
                if (err) {
                    throw new Error(err);
                }
            });
        },

        startListening = (bot, token) => {
            bot.listen(
                {
                    token: token,
                },
                (err, data) => {
                    if (err) {
                        throw new Error(err);
                    }

                    bot.self = data.self;
                    console.log(`Connected to Slack as ${bot.self.id}`);
                }
            );

        };

    bot.message((message) => {

        if (message.user === bot.self.id || !message.text) {
            return;
        }

        //match <id of user>: command ... or <id of user> command ...
        let match = message.text.match(/^\ *<@(.*)>\ *:?(.*)/);

        if (match && match.length === 3 && match[1] === bot.self.id) {

            const cmd = `ssh ${SSH_USER}@${SSH_HOST} ${SSH_PREFIX_CMD}${match[2]}`;
            console.log(cmd);

            //prevent interactive commands to lock the app
            const timeout = setTimeout(() => {
                console.warn(`Command timeout : ${cmd}`);
                ssh.reset();
                return sendMessage(-1, 'Command timeout', message.channel);
            }, SSH_TIMEOUT * 1000);

            ssh.exec(`${SSH_PREFIX_CMD}${match[2]}`, {
                exit: (code, stdout, stderr) => {
                    clearTimeout(timeout);
                    ssh.reset();

                    console.log(code);

                    return sendMessage(code, stdout || stderr, message.channel);
                },
            }).start();
        }
    });

    ssh.exec('exit', {
        exit: () => {
            ssh.reset();
            startListening(bot, SLACK_API_TOKEN);
        },
    }).start();

})();
