"use strict";


const APP_ID =
    "vpaas-magic-cookie-dbe56e5f85cc48a280fb38e749f470d5";


const KID =
    "vpaas-magic-cookie-dbe56e5f85cc48a280fb38e749f470d5/17586a";


/* ============================================================
   CONSTANTS
============================================================ */

const GLOBAL_SIGNAL_ID =
    "GLOBAL_CALL_SIGNAL";


const PRESENCE_TIMEOUT =
    30 * 1000;


/* ============================================================
   CORS
============================================================ */

function corsHeaders() {

    return {

        "Access-Control-Allow-Origin":
            "*",

        "Access-Control-Allow-Methods":
            "POST, OPTIONS, GET",

        "Access-Control-Allow-Headers":
            "Content-Type",

        "Content-Type":
            "application/json"

    };

}


/* ============================================================
   RESPONSE
============================================================ */

function json(
    data,
    status = 200
) {

    return new Response(

        JSON.stringify(data),

        {
            status:
                status,

            headers:
                corsHeaders()

        }

    );

}


/* ============================================================
   BASE64URL
============================================================ */

function base64url(
    input
) {

    let bytes;


    if (
        input instanceof
        Uint8Array
    ) {

        bytes =
            input;

    } else {

        bytes =
            new TextEncoder().encode(
                String(input)
            );

    }


    let binary =
        "";


    const chunk =
        0x8000;


    for (
        let i = 0;
        i < bytes.length;
        i += chunk
    ) {

        binary +=
            String.fromCharCode(
                ...bytes.subarray(
                    i,
                    Math.min(
                        i + chunk,
                        bytes.length
                    )
                )
            );

    }


    return btoa(binary)

        .replace(
            /\+/g,
            "-"
        )

        .replace(
            /\//g,
            "_"
        )

        .replace(
            /=+$/,
            ""
        );

}


/* ============================================================
   NORMALIZE PRIVATE KEY
============================================================ */

function normalizePrivateKey(
    pem
) {

    if (
        typeof pem !==
        "string"
    ) {

        throw new Error(
            "JAAS_PRIVATE_KEY is not a string."
        );

    }


    let key =
        pem
            .replace(
                /^\uFEFF/,
                ""
            )
            .trim();


    key =
        key.replace(
            /\\n/g,
            "\n"
        );


    if (

        (
            key.startsWith('"') &&
            key.endsWith('"')
        )

        ||

        (
            key.startsWith("'") &&
            key.endsWith("'")
        )

    ) {

        key =
            key
                .slice(
                    1,
                    -1
                )
                .trim();

    }


    key =
        key.replace(
            /\r\n/g,
            "\n"
        );


    key =
        key.replace(
            /\r/g,
            "\n"
        );


    return key.trim();

}


/* ============================================================
   PEM -> DER
============================================================ */

function pemToArrayBuffer(
    pem
) {

    const normalized =
        normalizePrivateKey(
            pem
        );


    if (
        !normalized.includes(
            "-----BEGIN PRIVATE KEY-----"
        )
    ) {

        if (
            normalized.includes(
                "-----BEGIN RSA PRIVATE KEY-----"
            )
        ) {

            throw new Error(
                "Private key is PKCS#1. Expected PKCS#8 BEGIN PRIVATE KEY."
            );

        }


        throw new Error(
            "Invalid PEM format. Expected BEGIN PRIVATE KEY."
        );

    }


    if (
        !normalized.includes(
            "-----END PRIVATE KEY-----"
        )
    ) {

        throw new Error(
            "Private key is missing END PRIVATE KEY."
        );

    }


    const base64 =
        normalized

            .replace(
                /-----BEGIN PRIVATE KEY-----/g,
                ""
            )

            .replace(
                /-----END PRIVATE KEY-----/g,
                ""
            )

            .replace(
                /\s/g,
                ""
            );


    if (!base64) {

        throw new Error(
            "Private key body is empty."
        );

    }


    let binary;


    try {

        binary =
            atob(base64);

    } catch (error) {

        throw new Error(
            "Private key contains invalid Base64 data."
        );

    }


    const bytes =
        new Uint8Array(
            binary.length
        );


    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(i);

    }


    return bytes.buffer;

}


/* ============================================================
   IMPORT PRIVATE KEY
============================================================ */

async function importPrivateKey(
    privateKeyPem
) {

    const keyData =
        pemToArrayBuffer(
            privateKeyPem
        );


    try {

        return await crypto.subtle.importKey(

            "pkcs8",

            keyData,

            {
                name:
                    "RSASSA-PKCS1-v1_5",

                hash:
                    "SHA-256"

            },

            false,

            [
                "sign"
            ]

        );

    } catch (error) {

        throw new Error(

            "PKCS#8 private key import failed: " +

            (
                error &&
                error.message
                    ? error.message
                    : String(error)
            )

        );

    }

}


/* ============================================================
   CREATE JWT
============================================================ */

async function createJWT(
    privateKeyPem,
    name,
    room
) {

    const now =
        Math.floor(
            Date.now() / 1000
        );


    const exp =
        now +
        (60 * 60 * 2);


    const userId =
        crypto.randomUUID();


    /* ========================================================
       HEADER
    ======================================================== */

    const header = {

        alg:
            "RS256",

        kid:
            KID,

        typ:
            "JWT"

    };


    /* ========================================================
       PAYLOAD
    ======================================================== */

    const payload = {

        aud:
            "jitsi",

        iss:
            "chat",

        sub:
            APP_ID,

        room:
            room,

        nbf:
            now - 5,

        exp:
            exp,


        context: {

            user: {

                id:
                    userId,

                name:
                    name,

                avatar:
                    "",

                email:
                    ""

            },


            features: {

                livestreaming:
                    false,

                recording:
                    false,

                transcription:
                    false,

                "sip-inbound-call":
                    false,

                "sip-outbound-call":
                    false,

                "inbound-call":
                    false,

                "outbound-call":
                    false

            }

        }

    };


    /* ========================================================
       ENCODE
    ======================================================== */

    const encodedHeader =
        base64url(
            JSON.stringify(
                header
            )
        );


    const encodedPayload =
        base64url(
            JSON.stringify(
                payload
            )
        );


    const unsignedToken =
        encodedHeader +
        "." +
        encodedPayload;


    /* ========================================================
       IMPORT KEY
    ======================================================== */

    const key =
        await importPrivateKey(
            privateKeyPem
        );


    /* ========================================================
       SIGN
    ======================================================== */

    let signature;


    try {

        signature =
            await crypto.subtle.sign(

                {
                    name:
                        "RSASSA-PKCS1-v1_5"
                },

                key,

                new TextEncoder().encode(
                    unsignedToken
                )

            );

    } catch (error) {

        throw new Error(

            "JWT signing failed: " +

            (
                error &&
                error.message
                    ? error.message
                    : String(error)
            )

        );

    }


    /* ========================================================
       FINAL TOKEN
    ======================================================== */

    return (

        unsignedToken +

        "." +

        base64url(
            new Uint8Array(
                signature
            )
        )

    );

}


/* ============================================================
   CALL SIGNALING HELPER
============================================================ */

async function callSignal(
    request,
    env,
    action
) {

    if (!env.CALL_SIGNAL) {

        return json(

            {
                error:
                    "CALL_SIGNAL Durable Object is not configured yet."
            },

            500

        );

    }


    const id =
        env.CALL_SIGNAL.idFromName(
            GLOBAL_SIGNAL_ID
        );


    const stub =
        env.CALL_SIGNAL.get(
            id
        );


    const url =
        new URL(
            request.url
        );


    url.pathname =
        "/signal/" +
        action;


    return stub.fetch(

        new Request(
            url.toString(),
            request
        )

    );

}


/* ============================================================
   REQUEST HANDLER
============================================================ */

export default {

    async fetch(
        request,
        env
    ) {

        const url =
            new URL(
                request.url
            );


        /* ======================================================
           OPTIONS
        ====================================================== */

        if (
            request.method ===
            "OPTIONS"
        ) {

            return new Response(

                null,

                {
                    status:
                        204,

                    headers:
                        corsHeaders()

                }

            );

        }


        /* ======================================================
           HEALTH
        ====================================================== */

        if (
            url.pathname ===
            "/api/health"
        ) {

            return json({

                ok:
                    true,

                service:
                    "1v1 Video Call",

                signaling:
                    !!env.CALL_SIGNAL

            });

        }


        /* ======================================================
           DEBUG
        ====================================================== */

        if (
            url.pathname ===
            "/api/debug"
        ) {

            const secret =
                env.JAAS_PRIVATE_KEY;


            return json({

                worker:
                    "presence-version",

                secretConfigured:
                    !!secret,

                secretLength:
                    secret
                        ? secret.length
                        : 0,

                hasBeginPrivateKey:
                    secret
                        ? secret.includes(
                            "BEGIN PRIVATE KEY"
                        )
                        : false,

                hasEndPrivateKey:
                    secret
                        ? secret.includes(
                            "END PRIVATE KEY"
                        )
                        : false,

                hasRSAKey:
                    secret
                        ? secret.includes(
                            "BEGIN RSA PRIVATE KEY"
                        )
                        : false,

                callSignalConfigured:
                    !!env.CALL_SIGNAL

            });

        }


        /* ======================================================
           CREATE CALL
        ====================================================== */

        if (
            url.pathname ===
            "/api/call"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            return callSignal(
                request,
                env,
                "create"
            );

        }


        /* ======================================================
           POLL CALL
        ====================================================== */

        if (
            url.pathname ===
            "/api/call/poll"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            return callSignal(
                request,
                env,
                "poll"
            );

        }


        /* ======================================================
           ACCEPT
        ====================================================== */

        if (
            url.pathname ===
            "/api/call/accept"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            return callSignal(
                request,
                env,
                "accept"
            );

        }


        /* ======================================================
           DECLINE
        ====================================================== */

        if (
            url.pathname ===
            "/api/call/decline"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            return callSignal(
                request,
                env,
                "decline"
            );

        }


        /* ======================================================
           CANCEL
        ====================================================== */

        if (
            url.pathname ===
            "/api/call/cancel"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            return callSignal(
                request,
                env,
                "cancel"
            );

        }


        /* ======================================================
           STATUS
        ====================================================== */

        if (
            url.pathname ===
            "/api/call/status"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            return callSignal(
                request,
                env,
                "status"
            );

        }


        /* ======================================================
           PRESENCE ONLINE
        ====================================================== */

        if (
            url.pathname ===
            "/api/presence/online"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            return callSignal(
                request,
                env,
                "presence-online"
            );

        }


        /* ======================================================
           PRESENCE POLL
        ====================================================== */

        if (
            url.pathname ===
            "/api/presence/poll"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            return callSignal(
                request,
                env,
                "presence-poll"
            );

        }


        /* ======================================================
           PRESENCE OFFLINE
        ====================================================== */

        if (
            url.pathname ===
            "/api/presence/offline"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            return callSignal(
                request,
                env,
                "presence-offline"
            );

        }


        /* ======================================================
           JWT TOKEN
        ====================================================== */

        if (
            url.pathname ===
            "/api/token"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(
                    {
                        error:
                            "Method not allowed."
                    },
                    405
                );

            }


            if (
                !env.JAAS_PRIVATE_KEY
            ) {

                return json(
                    {
                        error:
                            "JAAS_PRIVATE_KEY secret is not configured."
                    },
                    500
                );

            }


            let body;


            try {

                body =
                    await request.json();

            } catch (_) {

                return json(
                    {
                        error:
                            "Invalid JSON."
                    },
                    400
                );

            }


            const name =
                String(
                    body.name || ""
                )
                    .trim()
                    .slice(
                        0,
                        40
                    );


            const room =
                String(
                    body.room || ""
                )
                    .trim()
                    .replace(
                        /[^a-zA-Z0-9_-]/g,
                        ""
                    )
                    .slice(
                        0,
                        40
                    );


            if (!name) {

                return json(
                    {
                        error:
                            "Name is required."
                    },
                    400
                );

            }


            if (!room) {

                return json(
                    {
                        error:
                            "Room is required."
                    },
                    400
                );

            }


            try {

                const token =
                    await createJWT(

                        env.JAAS_PRIVATE_KEY,

                        name,

                        room

                    );


                return json({

                    token:
                        token,

                    appId:
                        APP_ID

                });


            } catch (error) {

                console.error(
                    "JWT ERROR:",
                    error
                );


                return json(
                    {

                        error:
                            "JWT generation failed.",

                        details:
                            error &&
                            error.message
                                ? error.message
                                : String(error)

                    },
                    500
                );

            }

        }


        /* ======================================================
           STATIC ASSETS
        ====================================================== */

        if (
            env.ASSETS
        ) {

            return env.ASSETS.fetch(
                request
            );

        }


        /* ======================================================
           FALLBACK
        ====================================================== */

        return new Response(

            "1v1 Video Call API",

            {
                status:
                    404
            }

        );

    }

};


/* ============================================================
   DURABLE OBJECT
============================================================ */

export class CallSignal {

    constructor(
        state,
        env
    ) {

        this.state =
            state;

        this.env =
            env;

    }


    /* ========================================================
       CLEAN OLD DATA
    ======================================================== */

    async cleanup() {

        const now =
            Date.now();


        /* ======================================================
           CLEAN CALLS
        ====================================================== */

        const callEntries =
            await this.state.storage.list({

                prefix:
                    "call:"

            });


        for (
            const [key, call]
            of callEntries
        ) {

            if (
                !call ||
                !call.createdAt ||
                now -
                    call.createdAt >
                    (5 * 60 * 1000)
            ) {

                await this.state.storage.delete(
                    key
                );

            }

        }


        /* ======================================================
           CLEAN PRESENCE
        ====================================================== */

        const presenceEntries =
            await this.state.storage.list({

                prefix:
                    "presence:"

            });


        for (
            const [key, user]
            of presenceEntries
        ) {

            if (
                !user ||
                !user.lastSeenAt ||
                now -
                    user.lastSeenAt >
                    PRESENCE_TIMEOUT
            ) {

                await this.state.storage.delete(
                    key
                );

            }

        }

    }


    /* ========================================================
       READ BODY
    ======================================================== */

    async readBody(
        request
    ) {

        try {

            return await request.json();

        } catch (_) {

            return null;

        }

    }


    /* ========================================================
       VALIDATE ID
    ======================================================== */

    validId(
        value
    ) {

        return (

            typeof value ===
            "string"

            &&

            value.length >= 3

            &&

            value.length <= 100

            &&

            /^[a-zA-Z0-9_-]+$/.test(
                value
            )

        );

    }


    /* ========================================================
       GET ACTIVE CALL
    ======================================================== */

    async getActiveCallForUser(
        userId
    ) {

        const entries =
            await this.state.storage.list({

                prefix:
                    "call:"

            });


        for (
            const [, call]
            of entries
        ) {

            if (
                !call
            ) {

                continue;

            }


            const active =
                call.status ===
                    "ringing"

                ||

                call.status ===
                    "accepted";


            if (
                active &&

                (
                    call.callerId ===
                        userId

                    ||

                    call.receiverId ===
                        userId
                )
            ) {

                return call;

            }

        }


        return null;

    }


    /* ========================================================
       CREATE CALL
    ======================================================== */

    async createCall(
        request
    ) {

        const body =
            await this.readBody(
                request
            );


        if (!body) {

            return json(
                {
                    error:
                        "Invalid JSON."
                },
                400
            );

        }


        const callerId =
            String(
                body.callerId ||
                ""
            )
                .trim();


        const callerName =
            String(
                body.callerName ||
                ""
            )
                .trim()
                .slice(
                    0,
                    40
                );


        const receiverId =
            String(
                body.receiverId ||
                ""
            )
                .trim();


        const receiverName =
            String(
                body.receiverName ||
                ""
            )
                .trim()
                .slice(
                    0,
                    40
                );


        const room =
            String(
                body.room ||
                ""
            )
                .trim()
                .replace(
                    /[^a-zA-Z0-9_-]/g,
                    ""
                )
                .slice(
                    0,
                    40
                );


        if (
            !this.validId(
                callerId
            )
        ) {

            return json(
                {
                    error:
                        "Invalid callerId."
                },
                400
            );

        }


        if (!callerName) {

            return json(
                {
                    error:
                        "Caller name is required."
                },
                400
            );

        }


        if (
            !this.validId(
                receiverId
            )
        ) {

            return json(
                {
                    error:
                        "Invalid receiverId."
                },
                400
            );

        }


        if (!room) {

            return json(
                {
                    error:
                        "Room is required."
                },
                400
            );

        }


        if (
            callerId ===
            receiverId
        ) {

            return json(
                {
                    error:
                        "You cannot call yourself."
                },
                400
            );

        }


        /* ==================================================
           VERIFY RECEIVER IS ONLINE
        ================================================== */

        const receiverPresence =
            await this.state.storage.get(
                "presence:" +
                receiverId
            );


        if (
            !receiverPresence ||

            !receiverPresence.lastSeenAt ||

            Date.now() -
                receiverPresence.lastSeenAt >
                PRESENCE_TIMEOUT
        ) {

            return json(
                {
                    error:
                        "This user is offline."
                },
                409
            );

        }


        /* ==================================================
           PREVENT MULTIPLE ACTIVE CALLS
        ================================================== */

        const callerActiveCall =
            await this.getActiveCallForUser(
                callerId
            );


        if (
            callerActiveCall
        ) {

            return json(
                {
                    error:
                        "You are already in another call.",
                    call:
                        callerActiveCall
                },
                409
            );

        }


        const receiverActiveCall =
            await this.getActiveCallForUser(
                receiverId
            );


        if (
            receiverActiveCall
        ) {

            return json(
                {
                    error:
                        "This user is already in another call.",
                    call:
                        receiverActiveCall
                },
                409
            );

        }


        /* ==================================================
           CREATE CALL
        ================================================== */

        const callId =
            crypto.randomUUID();


        const now =
            Date.now();


        const call = {

            callId:
                callId,

            callerId:
                callerId,

            callerName:
                callerName,

            receiverId:
                receiverId,

            receiverName:
                receiverName ||
                receiverPresence.name ||
                "User",

            room:
                room,

            status:
                "ringing",

            createdAt:
                now,

            updatedAt:
                now

        };


        await this.state.storage.put(

            "call:" +
            callId,

            call

        );


        return json({

            ok:
                true,

            call:
                call

        });

    }


    /* ========================================================
       POLL INCOMING CALLS
    ======================================================== */

    async pollIncomingCalls(
        request
    ) {

        const body =
            await this.readBody(
                request
            );


        if (!body) {

            return json(
                {
                    error:
                        "Invalid JSON."
                },
                400
            );

        }


        const userId =
            String(
                body.userId ||
                ""
            )
                .trim();


        if (
            !this.validId(
                userId
            )
        ) {

            return json(
                {
                    error:
                        "Invalid userId."
                },
                400
            );

        }


        const entries =
            await this.state.storage.list({

                prefix:
                    "call:"

            });


        const calls = [];


        for (
            const [, call]
            of entries
        ) {

            if (
                call &&

                call.receiverId ===
                    userId &&

                call.status ===
                    "ringing"
            ) {

                calls.push(
                    call
                );

            }

        }


        calls.sort(
            (
                a,
                b
            ) =>
                a.createdAt -
                b.createdAt
        );


        return json({

            ok:
                true,

            calls:
                calls

        });

    }


    /* ========================================================
       PRESENCE ONLINE
    ======================================================== */

    async presenceOnline(
        request
    ) {

        const body =
            await this.readBody(
                request
            );


        if (!body) {

            return json(
                {
                    error:
                        "Invalid JSON."
                },
                400
            );

        }


        const userId =
            String(
                body.userId ||
                ""
            )
                .trim();


        const name =
            String(
                body.name ||
                ""
            )
                .trim()
                .slice(
                    0,
                    40
                );


        if (
            !this.validId(
                userId
            )
        ) {

            return json(
                {
                    error:
                        "Invalid userId."
                },
                400
            );

        }


        if (!name) {

            return json(
                {
                    error:
                        "Name is required."
                },
                400
            );

        }


        const existing =
            await this.state.storage.get(
                "presence:" +
                userId
            );


        const now =
            Date.now();


        const user = {

            userId:
                userId,

            name:
                name,

            lastSeenAt:
                now

        };


        await this.state.storage.put(

            "presence:" +
            userId,

            user

        );


        return json({

            ok:
                true,

            user:
                user

        });

    }


    /* ========================================================
       PRESENCE POLL
    ======================================================== */

    async presencePoll(
        request
    ) {

        const body =
            await this.readBody(
                request
            );


        if (!body) {

            return json(
                {
                    error:
                        "Invalid JSON."
                },
                400
            );

        }


        const currentUserId =
            String(
                body.userId ||
                ""
            )
                .trim();


        if (
            !this.validId(
                currentUserId
            )
        ) {

            return json(
                {
                    error:
                        "Invalid userId."
                },
                400
            );

        }


        const now =
            Date.now();


        const presenceEntries =
            await this.state.storage.list({

                prefix:
                    "presence:"

            });


        const users = [];


        for (
            const [, user]
            of presenceEntries
        ) {

            if (
                !user
            ) {

                continue;

            }


            if (
                user.userId ===
                currentUserId
            ) {

                continue;

            }


            if (
                !user.lastSeenAt
            ) {

                continue;

            }


            if (
                now -
                    user.lastSeenAt >
                    PRESENCE_TIMEOUT
            ) {

                continue;

            }


            const activeCall =
                await this.getActiveCallForUser(
                    user.userId
                );


            users.push({

                userId:
                    user.userId,

                name:
                    user.name ||
                    "User",

                status:
                    activeCall
                        ? "busy"
                        : "online"

            });

        }


        users.sort(
            (
                a,
                b
            ) => {

                if (
                    a.status ===
                    b.status
                ) {

                    return a.name.localeCompare(
                        b.name
                    );

                }


                if (
                    a.status ===
                    "online"
                ) {

                    return -1;

                }


                return 1;

            }
        );


        return json({

            ok:
                true,

            users:
                users

        });

    }


    /* ========================================================
       PRESENCE OFFLINE
    ======================================================== */

    async presenceOffline(
        request
    ) {

        const body =
            await this.readBody(
                request
            );


        if (!body) {

            return json(
                {
                    error:
                        "Invalid JSON."
                },
                400
            );

        }


        const userId =
            String(
                body.userId ||
                ""
            )
                .trim();


        if (
            !this.validId(
                userId
            )
        ) {

            return json(
                {
                    error:
                        "Invalid userId."
                },
                400
            );

        }


        await this.state.storage.delete(

            "presence:" +
            userId

        );


        return json({

            ok:
                true

        });

    }


    /* ========================================================
       CALL ACTIONS
    ======================================================== */

    async callAction(
        request,
        action
    ) {

        const body =
            await this.readBody(
                request
            );


        if (!body) {

            return json(
                {
                    error:
                        "Invalid JSON."
                },
                400
            );

        }


        const callId =
            String(
                body.callId ||
                ""
            )
                .trim();


        const userId =
            String(
                body.userId ||
                ""
            )
                .trim();


        if (
            !this.validId(
                callId.replace(
                    /-/g,
                    ""
                )
            )
        ) {

            return json(
                {
                    error:
                        "Invalid callId."
                },
                400
            );

        }


        if (
            !this.validId(
                userId
            )
        ) {

            return json(
                {
                    error:
                        "Invalid userId."
                },
                400
            );

        }


        const key =
            "call:" +
            callId;


        const call =
            await this.state.storage.get(
                key
            );


        if (!call) {

            return json(
                {
                    error:
                        "Call not found."
                },
                404
            );

        }


        /* ==================================================
           STATUS
        ================================================== */

        if (
            action ===
            "status"
        ) {

            if (

                userId !==
                    call.callerId

                &&

                userId !==
                    call.receiverId

            ) {

                return json(
                    {
                        error:
                            "Not authorized."
                    },
                    403
                );

            }


            return json({

                ok:
                    true,

                call:
                    call

            });

        }


        /* ==================================================
           ACCEPT
        ================================================== */

        if (
            action ===
            "accept"
        ) {

            if (
                userId !==
                call.receiverId
            ) {

                return json(
                    {
                        error:
                            "Only receiver can accept."
                    },
                    403
                );

            }


            if (
                call.status !==
                "ringing"
            ) {

                return json({

                    ok:
                        true,

                    call:
                        call

                });

            }


            call.status =
                "accepted";


            call.updatedAt =
                Date.now();


            await this.state.storage.put(
                key,
                call
            );


            return json({

                ok:
                    true,

                call:
                    call

            });

        }


        /* ==================================================
           DECLINE
        ================================================== */

        if (
            action ===
            "decline"
        ) {

            if (
                userId !==
                call.receiverId
            ) {

                return json(
                    {
                        error:
                            "Only receiver can decline."
                    },
                    403
                );

            }


            if (
                call.status ===
                "ringing"
            ) {

                call.status =
                    "declined";


                call.updatedAt =
                    Date.now();


                await this.state.storage.put(
                    key,
                    call
                );

            }


            return json({

                ok:
                    true,

                call:
                    call

            });

        }


        /* ==================================================
           CANCEL
        ================================================== */

        if (
            action ===
            "cancel"
        ) {

            if (
                userId !==
                call.callerId
            ) {

                return json(
                    {
                        error:
                            "Only caller can cancel."
                    },
                    403
                );

            }


            if (
                call.status ===
                "ringing"
            ) {

                call.status =
                    "cancelled";


                call.updatedAt =
                    Date.now();


                await this.state.storage.put(
                    key,
                    call
                );

            }


            return json({

                ok:
                    true,

                call:
                    call

            });

        }


        return json(
            {
                error:
                    "Unknown call action."
            },
            404
        );

    }


    /* ========================================================
       FETCH
    ======================================================== */

    async fetch(
        request
    ) {

        const url =
            new URL(
                request.url
            );


        const action =
            url.pathname
                .replace(
                    "/signal/",
                    ""
                );


        await this.cleanup();


        /* ======================================================
           CREATE CALL
        ====================================================== */

        if (
            action ===
            "create"
        ) {

            return this.createCall(
                request
            );

        }


        /* ======================================================
           POLL INCOMING CALLS
        ====================================================== */

        if (
            action ===
            "poll"
        ) {

            return this.pollIncomingCalls(
                request
            );

        }


        /* ======================================================
           PRESENCE ONLINE
        ====================================================== */

        if (
            action ===
            "presence-online"
        ) {

            return this.presenceOnline(
                request
            );

        }


        /* ======================================================
           PRESENCE POLL
        ====================================================== */

        if (
            action ===
            "presence-poll"
        ) {

            return this.presencePoll(
                request
            );

        }


        /* ======================================================
           PRESENCE OFFLINE
        ====================================================== */

        if (
            action ===
            "presence-offline"
        ) {

            return this.presenceOffline(
                request
            );

        }


        /* ======================================================
           ACCEPT / DECLINE / CANCEL / STATUS
        ====================================================== */

        if (

            action ===
                "accept"

            ||

            action ===
                "decline"

            ||

            action ===
                "cancel"

            ||

            action ===
                "status"

        ) {

            return this.callAction(
                request,
                action
            );

        }


        return json(

            {
                error:
                    "Unknown signaling action."
            },

            404

        );

    }

}
