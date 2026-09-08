"use strict";


const APP_ID =
    "vpaas-magic-cookie-dbe56e5f85cc48a280fb38e749f470d5";


const KID =
    "vpaas-magic-cookie-dbe56e5f85cc48a280fb38e749f470d5/17586a";


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
            status: status,

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


    /*
     * 2 hour token lifetime
     */

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
            "GLOBAL_CALL_SIGNAL"
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
        "/signal/" + action;


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
           HEALTH CHECK
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
           DEBUG CHECK
           
           IMPORTANT:
           This NEVER returns the private key.
        ====================================================== */

        if (
            url.pathname ===
            "/api/debug"
        ) {

            const secret =
                env.JAAS_PRIVATE_KEY;


            return json({

                worker:
                    "new-version",

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
           
           Caller -> Receiver
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
           POLL INCOMING CALL
           
           Receiver checks for new calls.
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
           ACCEPT CALL
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
           DECLINE CALL
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
           CANCEL CALL
           
           Caller cancels before receiver accepts.
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
           CALL STATUS
           
           Caller checks whether receiver accepted/declined.
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
           JWT ENDPOINT
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


            /* ==================================================
               PRIVATE KEY CHECK
            ================================================== */

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


            /* ==================================================
               JSON BODY
            ================================================== */

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


            /* ==================================================
               NAME
            ================================================== */

            const name =
                String(
                    body.name || ""
                )
                    .trim()
                    .slice(
                        0,
                        40
                    );


            /* ==================================================
               ROOM
            ================================================== */

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


            /* ==================================================
               VALIDATION
            ================================================== */

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


            /* ==================================================
               CREATE JWT
            ================================================== */

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
           
           index.html
           style.css
           app.js
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
   ============================================================

   Handles:

   - Create incoming call
   - Poll incoming calls
   - Accept
   - Decline
   - Cancel
   - Status

   D1 မလိုပါ။
   Durable Object SQLite storage ကိုပဲ အသုံးပြုထားပါတယ်။
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
       CLEAN OLD CALLS
    ======================================================== */

    async cleanup() {

        const now =
            Date.now();


        const entries =
            await this.state.storage.list({
                prefix:
                    "call:"
            });


        for (
            const [key, call]
            of entries
        ) {

            if (
                !call ||
                !call.createdAt ||
                now - call.createdAt >
                    (5 * 60 * 1000)
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
           CREATE
        ====================================================== */

        if (
            action ===
            "create"
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
                ).trim();


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
                ).trim();


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


            if (
                !callerName
            ) {

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


            if (
                !room
            ) {

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


            const callId =
                crypto.randomUUID();


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
                    receiverName,

                room:
                    room,

                status:
                    "ringing",

                createdAt:
                    Date.now(),

                updatedAt:
                    Date.now()

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


        /* ======================================================
           POLL
        ====================================================== */

        if (
            action ===
            "poll"
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
                ).trim();


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


        /* ======================================================
           FIND CALL
        ====================================================== */

        if (
            action ===
            "accept" ||

            action ===
            "decline" ||

            action ===
            "cancel" ||

            action ===
            "status"
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
                ).trim();


            const userId =
                String(
                    body.userId ||
                    ""
                ).trim();


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
                        call.callerId &&

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
