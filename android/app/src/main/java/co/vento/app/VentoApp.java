package co.vento.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Application;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.MutableContextWrapper;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Locale;

/**
 * El «motor» de Vento: una sola página de Vento que vive mientras viva la app (no la ventana).
 * La ventana (MainActivity) solo la muestra; si la ventana se cierra o la app se quita de
 * recientes, el motor sigue corriendo con el servicio de fondo (VentoServicio): siguen llegando
 * los pedidos y siguen sonando las canciones en el TV.
 */
public class VentoApp extends Application {

    static final String URL_VENTO = "https://cristhianlujan45-blip.github.io/cuentas/";
    static final String HOST_VENTO = "cristhianlujan45-blip.github.io";

    static VentoApp app;
    static WebView web;                         // la página de Vento (una sola, para que nada se duplique)
    static MutableContextWrapper envoltura;     // la página usa la ventana cuando hay, o la app cuando no
    static volatile boolean alFrente = false;   // la ventana de Vento se está viendo ahora
    static int avisoN = 100;
    static MainActivity ventana;                // la ventana abierta (null si está cerrada)
    static final Handler ui = new Handler(Looper.getMainLooper());

    private SpeechRecognizer voz;
    private String vozIdioma = "es-CO";
    private boolean vozParcial = true;
    boolean vozPendiente = false;
    private TextToSpeech tts;
    private boolean ttsListo = false;
    private boolean vozMuda = false;

    @Override
    public void onCreate() {
        super.onCreate();
        app = this;
    }

    /** Crea la página de Vento si todavía no existe. Siempre en el hilo principal. */
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    static WebView motor(Context base) {
        if (web != null) {
            if (base != null) envoltura.setBaseContext(base);
            return web;
        }
        envoltura = new MutableContextWrapper(base != null ? base : app);
        web = new WebView(envoltura);
        web.setBackgroundColor(0xFF0B0A12);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setAllowFileAccess(false);
        s.setOffscreenPreRaster(true);          // sigue trabajando aunque no se esté mostrando
        s.setUserAgentString(s.getUserAgentString() + " VentoAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(app.new Puente(), "VentoAndroid");
        web.setWebViewClient(new Clientes.Navegacion());
        web.setWebChromeClient(new Clientes.Cromo());
        // De fondo, Android baja la prioridad de la página y a veces la cierra: así sigue como «importante».
        if (Build.VERSION.SDK_INT >= 26) {
            try { web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false); } catch (Exception ignorado) { }
        }
        web.loadUrl(URL_VENTO);
        return web;
    }

    static void js(final String codigo) {
        ui.post(() -> { if (web != null) web.evaluateJavascript(codigo, null); });
    }

    static String q(String s) { return JSONObject.quote(s == null ? "" : s); }

    static boolean tiene(String permiso) {
        return Build.VERSION.SDK_INT < 23 || app.checkSelfPermission(permiso) == PackageManager.PERMISSION_GRANTED;
    }

    static void aviso(String t) { ui.post(() -> Toast.makeText(app, t, Toast.LENGTH_LONG).show()); }

    // ---------------------------------------------------------------- Voz (dictado) con el reconocedor de Android
    // Dictado: el reconocedor se REUSA (crearlo cada vez hacía que la primera escucha fallara al instante en muchos
    // celulares: «ocupado» / «no te entendí» sin dejarte hablar). Si falla apenas empieza o antes de oírte, se vuelve a
    // poner a escuchar solo (hasta 2 veces), sin que tengas que tocar el micrófono otra vez.
    private long vozInicio = 0;
    private boolean vozHablo = false;
    private int vozReintentos = 0;

    void iniciarVoz() {
        vozPendiente = false;
        vozReintentos = 0;
        escucharVoz(false);
    }

    private void escucharVoz(boolean nuevo) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            js("window.__ventoVoz&&window.__ventoVoz('error',{error:'service-not-allowed'});window.__ventoVoz&&window.__ventoVoz('end',{})");
            return;
        }
        if (nuevo || voz == null) {
            try { if (voz != null) voz.destroy(); } catch (Exception ignorado) { }
            voz = SpeechRecognizer.createSpeechRecognizer(this);
        } else {
            try { voz.cancel(); } catch (Exception ignorado) { }
        }
        vozInicio = System.currentTimeMillis();
        vozHablo = false;
        voz.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(android.os.Bundle b) { js("window.__ventoVoz&&window.__ventoVoz('start',{})"); }
            @Override public void onBeginningOfSpeech() { vozHablo = true; }
            @Override public void onRmsChanged(float v) { }
            @Override public void onBufferReceived(byte[] b) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int t, android.os.Bundle b) { }

            @Override
            public void onError(int error) {
                long dura = System.currentTimeMillis() - vozInicio;
                boolean arranque = dura < 2500 && error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS;
                boolean sinOir = !vozHablo && (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_CLIENT || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY);
                if (vozReintentos < 2 && (arranque || sinOir) && dura < 9000) {
                    vozReintentos++;
                    // Primer tropiezo: se vuelve a pedir con el MISMO reconocedor (crearlo de nuevo es lo que tarda y
                    // hace perder lo que se dice); solo si vuelve a fallar se crea uno nuevo.
                    final boolean recrear = vozReintentos >= 2 && (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT || error == SpeechRecognizer.ERROR_SERVER);
                    ui.postDelayed(() -> escucharVoz(recrear), error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 450 : 200);
                    return;
                }
                String e;
                switch (error) {
                    case SpeechRecognizer.ERROR_NO_MATCH:
                    case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: e = "no-speech"; break;
                    case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: e = "not-allowed"; break;
                    case SpeechRecognizer.ERROR_NETWORK:
                    case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: e = "network"; break;
                    case SpeechRecognizer.ERROR_AUDIO: e = "audio-capture"; break;
                    default: e = "aborted";
                }
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT) {
                    try { voz.destroy(); } catch (Exception ignorado) { } voz = null;     // la próxima vez arranca uno limpio
                }
                js("window.__ventoVoz&&window.__ventoVoz('error',{error:" + q(e) + "});window.__ventoVoz&&window.__ventoVoz('end',{})");
            }

            @Override public void onPartialResults(android.os.Bundle b) { vozHablo = true; mandarResultados(b, false); }

            @Override
            public void onResults(android.os.Bundle b) {
                mandarResultados(b, true);
                js("window.__ventoVoz&&window.__ventoVoz('end',{})");
            }
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, vozIdioma);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, vozParcial);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        // Un poco más de paciencia para terminar la frase (pedidos largos: «dos poker y una picada para la mesa 3»).
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1200L);
        try { voz.startListening(i); }
        catch (Exception e) {
            if (vozReintentos < 2) { vozReintentos++; ui.postDelayed(() -> escucharVoz(true), 350); return; }
            js("window.__ventoVoz&&window.__ventoVoz('error',{error:'aborted'});window.__ventoVoz&&window.__ventoVoz('end',{})");
        }
    }

    /** Deja el reconocedor creado y listo (al abrir la app), para que la primera vez que se toque el micrófono ya escuche. */
    void prepararVoz() {
        try {
            if (voz == null && tiene(Manifest.permission.RECORD_AUDIO) && SpeechRecognizer.isRecognitionAvailable(this))
                voz = SpeechRecognizer.createSpeechRecognizer(this);
        } catch (Exception ignorado) { }
    }

    void vozNegada() {
        vozPendiente = false;
        js("window.__ventoVoz&&window.__ventoVoz('error',{error:'not-allowed'});window.__ventoVoz&&window.__ventoVoz('end',{})");
    }

    private void mandarResultados(android.os.Bundle b, boolean esFinal) {
        try {
            ArrayList<String> textos = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            float[] conf = b.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
            if (textos == null || textos.isEmpty()) return;
            JSONArray alts = new JSONArray();
            for (int k = 0; k < textos.size(); k++) {
                JSONObject a = new JSONObject();
                a.put("t", textos.get(k));
                a.put("c", conf != null && k < conf.length && conf[k] >= 0 ? conf[k] : (k == 0 ? 0.9 : 0.5));
                alts.put(a);
            }
            JSONObject d = new JSONObject();
            d.put("alts", alts);
            d.put("final", esFinal);
            js("window.__ventoVoz&&window.__ventoVoz('result'," + d + ")");
        } catch (Exception ignorado) { }
    }

    // ---------------------------------------------------------------- Puente con la página (window.VentoAndroid)
    class Puente {
        private Thread escucha;
        private java.net.HttpURLConnection escuchaCon;

        @JavascriptInterface
        public String info() {
            try {
                JSONObject o = new JSONObject();
                o.put("version", BuildConfig.VERSION_NAME);
                o.put("codigo", BuildConfig.VERSION_CODE);
                o.put("android", Build.VERSION.SDK_INT);
                o.put("tv", true);
                o.put("puente", true);
                o.put("fondo", VentoServicio.activo);
                o.put("ventana", ventana != null);
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        /** Busca los TV del wifi. Cada uno llega a window.__ventoTV(tv); al final window.__ventoTVfin(n). */
        @JavascriptInterface
        public void buscarTVs() {
            new BuscadorTV(VentoApp.this).buscar(new BuscadorTV.Oyente() {
                @Override public void encontrado(JSONObject tv) { js("window.__ventoTV&&window.__ventoTV(" + tv + ")"); }
                @Override public void terminado(int n) { js("window.__ventoTVfin&&window.__ventoTVfin(" + n + "," + BuscadorTV.diagnostico() + ")"); }
            });
        }

        /** Abre YouTube en ese TV con el código de vinculación. Respuesta: window.__ventoCb(id, {status}). */
        @JavascriptInterface
        public void abrirYouTube(final String id, final String appUrl, final String codigo) {
            new Thread(() -> {
                int st = BuscadorTV.abrirYouTube(appUrl, codigo);
                js("window.__ventoCb&&window.__ventoCb(" + q(id) + ",{status:" + st + "})");
            }).start();
        }

        /**
         * Estado de YouTube en un TV del wifi (DIAL GET, como hace la app de YouTube y ytcast): {status, state, screenId}.
         * Si YouTube ya está abierto —aunque otro celular esté conectado— el TV da su screenId y Vento se une a esa
         * misma sesión sin volver a abrir YouTube. Respuesta: window.__ventoCb(id, {status, text: JSON}).
         */
        @JavascriptInterface
        public void infoYouTube(final String id, final String appUrl) {
            new Thread(() -> {
                String txt = BuscadorTV.infoYouTube(appUrl).toString();
                js("window.__ventoCb&&window.__ventoCb(" + q(id) + ",{status:200,text:" + q(txt) + "})");
            }).start();
        }

        /**
         * Puente del «YouTube del TV» DENTRO de la app: reenvía la llamada a www.youtube.com/api/lounge/…
         * (lo mismo que hace el puente de Cloudflare). Una app instalada no tiene el bloqueo del navegador,
         * así que no hace falta crear ni configurar el puente. Respuesta: window.__ventoCb(id, {status, text}).
         */
        @JavascriptInterface
        public void lounge(final String id, final String ruta, final String query, final String cuerpo, final String token) {
            new Thread(() -> {
                int st = -1; String txt = "";
                java.net.HttpURLConnection c = null;
                try {
                    if (ruta == null || !ruta.matches("[a-z_/]+")) throw new IllegalArgumentException("ruta");
                    String u = "https://www.youtube.com/api/lounge/" + ruta + (query == null || query.isEmpty() ? "" : "?" + query);
                    byte[] b = (cuerpo == null ? "" : cuerpo).getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    c = (java.net.HttpURLConnection) new java.net.URL(u).openConnection();
                    c.setConnectTimeout(12000);
                    c.setReadTimeout(15000);
                    c.setRequestMethod("POST");
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                    if (token != null && !token.isEmpty()) c.setRequestProperty("X-YouTube-LoungeId-Token", token);
                    c.setFixedLengthStreamingMode(b.length);
                    try (OutputStream o = c.getOutputStream()) { o.write(b); }
                    st = c.getResponseCode();
                    java.io.InputStream in = st >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in != null) {
                        try (java.io.InputStream i = in; java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                            byte[] buf = new byte[8192]; int n;
                            while ((n = i.read(buf)) > 0 && out.size() < 2_000_000) out.write(buf, 0, n);
                            txt = out.toString("UTF-8");
                        }
                    }
                } catch (Exception e) {
                    st = -1; txt = String.valueOf(e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                js("window.__ventoCb&&window.__ventoCb(" + q(id) + ",{status:" + st + ",text:" + q(txt) + "})");
            }).start();
        }

        /**
         * Buscar una canción en YouTube sin gastar el cupo de la clave compartida: se abre la página pública de
         * resultados de www.youtube.com (la misma que ve cualquiera en el navegador) y se sacan los primeros videos
         * (id, título, canal y duración). Responde por window.__ventoCb(id, {status, text}) con un JSON
         * [{v,t,c,d}] en text. Solo lectura; no usa cuentas ni claves.
         */
        @JavascriptInterface
        public void buscarYT(final String id, final String consulta) {
            new Thread(() -> {
                int st = -1; String txt = "";
                java.net.HttpURLConnection c = null;
                try {
                    String u = "https://www.youtube.com/results?hl=es&gl=CO&search_query=" + java.net.URLEncoder.encode(consulta == null ? "" : consulta, "UTF-8");
                    c = (java.net.HttpURLConnection) new java.net.URL(u).openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(10000);
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36");
                    c.setRequestProperty("Accept-Language", "es-CO,es;q=0.9");
                    c.setRequestProperty("Cookie", "CONSENT=YES+1");
                    st = c.getResponseCode();
                    String html = "";
                    java.io.InputStream in = st >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in != null) {
                        try (java.io.InputStream i = in; java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                            byte[] buf = new byte[16384]; int n;
                            while ((n = i.read(buf)) > 0 && out.size() < 3_000_000) out.write(buf, 0, n);
                            html = out.toString("UTF-8");
                        }
                    }
                    org.json.JSONArray arr = new org.json.JSONArray();
                    java.util.HashSet<String> vistos = new java.util.HashSet<>();
                    java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"videoRenderer\":\\{\"videoId\":\"([\\w-]{11})\"").matcher(html);
                    while (m.find() && arr.length() < 10) {
                        String vid = m.group(1);
                        if (!vistos.add(vid)) continue;
                        String trozo = html.substring(m.start(), Math.min(html.length(), m.start() + 6000));
                        org.json.JSONObject o = new org.json.JSONObject();
                        o.put("v", vid);
                        o.put("t", sacar(trozo, "\"title\":\\{\"runs\":\\[\\{\"text\":\"((?:[^\"\\\\]|\\\\.)*)\""));
                        o.put("c", sacar(trozo, "\"ownerText\":\\{\"runs\":\\[\\{\"text\":\"((?:[^\"\\\\]|\\\\.)*)\""));
                        o.put("d", sacar(trozo, "\"lengthText\":\\{.{0,400}?\"simpleText\":\"([0-9:]+)\""));
                        arr.put(o);
                    }
                    txt = arr.toString();
                    if (st < 400 && arr.length() == 0) st = 204;
                } catch (Exception e) {
                    st = -1; txt = String.valueOf(e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                js("window.__ventoCb&&window.__ventoCb(" + q(id) + ",{status:" + st + ",text:" + q(txt) + "})");
            }).start();
        }

        private String sacar(String texto, String patron) {
            try {
                java.util.regex.Matcher m = java.util.regex.Pattern.compile(patron).matcher(texto);
                if (!m.find()) return "";
                String r = m.group(1);
                try { r = new org.json.JSONObject("{\"x\":\"" + r + "\"}").getString("x"); } catch (Exception ignored) {}
                return r;
            } catch (Exception e) { return ""; }
        }

        /**
         * Escuchar al TV en vivo: el canal de vuelta del «YouTube del TV» (GET bc/bind con RID=rpc), el mismo que
         * usa la app de YouTube. Queda abierto y el TV va contando al instante qué suena, si pausó, si cambió de
         * canción o de lista. Cada trozo llega a window.__ventoTVev(id, texto); al cerrarse, window.__ventoTVcerro(id, código).
         * Hay un solo canal a la vez: abrir uno nuevo cierra el anterior.
         */
        @JavascriptInterface
        public void escucharTV(final String id, final String query, final String token) {
            pararTV(null);
            final Thread t = new Thread(() -> {
                int st = -1;
                java.net.HttpURLConnection c = null;
                try {
                    String base = System.getProperty("vento.lounge", "https://www.youtube.com/api/lounge/");
                    c = (java.net.HttpURLConnection) new java.net.URL(base + "bc/bind?" + (query == null ? "" : query)).openConnection();
                    synchronized (Puente.class) { escuchaCon = c; }
                    c.setConnectTimeout(12000);
                    c.setReadTimeout(90000);                    // el TV manda «noop» cada medio minuto más o menos
                    if (token != null && !token.isEmpty()) c.setRequestProperty("X-YouTube-LoungeId-Token", token);
                    st = c.getResponseCode();
                    if (st >= 200 && st < 300) {
                        try (java.io.InputStream in = c.getInputStream()) {
                            byte[] buf = new byte[16384]; int n;
                            while (!Thread.currentThread().isInterrupted() && (n = in.read(buf)) > 0) {
                                js("window.__ventoTVev&&window.__ventoTVev(" + q(id) + "," + q(new String(buf, 0, n, java.nio.charset.StandardCharsets.UTF_8)) + ")");
                            }
                        }
                    }
                } catch (Exception e) {
                    if (st < 0) st = -1;
                } finally {
                    if (c != null) c.disconnect();
                    synchronized (Puente.class) { if (escuchaCon == c) escuchaCon = null; }
                }
                js("window.__ventoTVcerro&&window.__ventoTVcerro(" + q(id) + "," + st + ")");
            });
            synchronized (Puente.class) { escucha = t; }
            t.start();
        }

        /** Cierra el canal en vivo con el TV (si id es null, cierra el que haya). */
        @JavascriptInterface
        public void pararTV(String id) {
            Thread t; java.net.HttpURLConnection c;
            synchronized (Puente.class) { t = escucha; c = escuchaCon; escucha = null; escuchaCon = null; }
            if (t != null) t.interrupt();
            if (c != null) new Thread(c::disconnect).start();
        }

        /**
         * Aviso del celular (con sonido) aunque Vento esté cerrada o la pantalla apagada: pedido nuevo, piden la
         * cuenta, canción pedida… Si la ventana de Vento se está viendo, no hace falta (ya sale en pantalla),
         * salvo que se pida «siempre». canal: pedidos | musica | avisos.
         */
        @JavascriptInterface
        public boolean notificar(String titulo, String texto, String canal, boolean siempre) {
            try {
                if (alFrente && !siempre) return false;
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm == null) return false;
                if (Build.VERSION.SDK_INT >= 33 && !tiene("android.permission.POST_NOTIFICATIONS")) return false;
                String id = "musica".equals(canal) ? "vento_musica2" : "avisos".equals(canal) ? "vento_avisos2" : "vento_pedidos2";
                if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(id) == null) {
                    int imp = "avisos".equals(canal) ? android.app.NotificationManager.IMPORTANCE_DEFAULT : android.app.NotificationManager.IMPORTANCE_HIGH;
                    android.app.NotificationChannel ch = new android.app.NotificationChannel(id,
                            "musica".equals(canal) ? "Canciones pedidas" : "avisos".equals(canal) ? "Avisos de Laya" : "Pedidos y cuentas", imp);
                    ch.setDescription("Suena aunque Vento esté cerrada.");
                    ch.enableVibration(!"avisos".equals(canal));
                    ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                    nm.createNotificationChannel(ch);
                }
                int flags = Build.VERSION.SDK_INT >= 23 ? android.app.PendingIntent.FLAG_IMMUTABLE : 0;
                android.app.PendingIntent abrir = android.app.PendingIntent.getActivity(VentoApp.this, 2,
                        new Intent(VentoApp.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK), flags);
                android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new android.app.Notification.Builder(VentoApp.this, id) : new android.app.Notification.Builder(VentoApp.this);
                b.setSmallIcon(android.R.drawable.ic_dialog_info)
                        .setContentTitle(titulo == null ? "Vento" : titulo)
                        .setContentText(texto == null ? "" : texto)
                        .setStyle(new android.app.Notification.BigTextStyle().bigText(texto == null ? "" : texto))
                        .setAutoCancel(true)
                        .setContentIntent(abrir)
                        .setWhen(System.currentTimeMillis()).setShowWhen(true);
                if (Build.VERSION.SDK_INT < 26) b.setDefaults(android.app.Notification.DEFAULT_ALL).setPriority(android.app.Notification.PRIORITY_HIGH);
                if (Build.VERSION.SDK_INT >= 21) b.setCategory("musica".equals(canal) ? android.app.Notification.CATEGORY_EVENT : android.app.Notification.CATEGORY_MESSAGE);
                nm.notify(avisoN++, b.build());
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Estado de los avisos del celular: si están prendidos, si falta el permiso y cómo está cada canal. */
        @JavascriptInterface
        public String avisosEstado() {
            try {
                JSONObject o = new JSONObject();
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                boolean on = nm != null && (Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled());
                o.put("prendidos", on);
                o.put("permiso", Build.VERSION.SDK_INT < 33 || tiene("android.permission.POST_NOTIFICATIONS"));
                JSONObject ch = new JSONObject();
                if (nm != null && Build.VERSION.SDK_INT >= 26) {
                    for (String id : new String[]{"vento_pedidos2", "vento_musica2", "vento_avisos2"}) {
                        android.app.NotificationChannel c = nm.getNotificationChannel(id);
                        if (c != null) ch.put(id, new JSONObject().put("importancia", c.getImportance()).put("bloqueo", c.getLockscreenVisibility()).put("sonido", c.getSound() != null).put("vibra", c.shouldVibrate()));
                    }
                }
                o.put("canales", ch);
                o.put("escucha", escuchaPermitida());
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        /** Prender los avisos: pide el permiso (Android 13+) o abre la pantalla de notificaciones de Vento. */
        @JavascriptInterface
        public void avisosActivar() {
            ui.post(() -> {
                MainActivity a = ventana;
                if (Build.VERSION.SDK_INT >= 33 && !tiene("android.permission.POST_NOTIFICATIONS") && a != null && !a.shouldShowRequestPermissionRationale("android.permission.POST_NOTIFICATIONS")
                        && !getSharedPreferences("vento", MODE_PRIVATE).getBoolean("avisosPedidos", false)) {
                    getSharedPreferences("vento", MODE_PRIVATE).edit().putBoolean("avisosPedidos", true).apply();
                    a.pedirPermisoAvisos();
                    return;
                }
                avisosAjustesAbrir();
            });
        }

        @JavascriptInterface
        public void avisosAjustes() { ui.post(this::avisosAjustesAbrir); }

        private void avisosAjustesAbrir() {
            Context x = ventana != null ? ventana : VentoApp.this;
            try {
                Intent i = new Intent(Build.VERSION.SDK_INT >= 26 ? android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS : android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                if (Build.VERSION.SDK_INT >= 26) i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                else i.setData(Uri.parse("package:" + getPackageName()));
                if (ventana == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                x.startActivity(i);
            } catch (Exception e) {
                try { Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())); if (ventana == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); x.startActivity(i); } catch (Exception ignorado) { }
            }
        }

        // ---------------------------------------------------------------- Música que ya suena desde el celular
        private boolean escuchaPermitida() {
            try {
                String s = android.provider.Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
                return s != null && s.contains(getPackageName());
            } catch (Exception e) { return false; }
        }

        /** Abre el permiso «Acceso a notificaciones» para Vento. */
        @JavascriptInterface
        public void mediosPermiso() {
            ui.post(() -> {
                Context x = ventana != null ? ventana : VentoApp.this;
                try {
                    Intent i;
                    if (Build.VERSION.SDK_INT >= 30) {
                        i = new Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                        i.putExtra(android.provider.Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, new android.content.ComponentName(VentoApp.this, VentoEscucha.class).flattenToString());
                    } else i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                    if (ventana == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    x.startActivity(i);
                } catch (Exception e) {
                    try { Intent i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"); if (ventana == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); x.startActivity(i); } catch (Exception ignorado) { }
                }
            });
        }

        private java.util.List<android.media.session.MediaController> controles() {
            android.media.session.MediaSessionManager msm = (android.media.session.MediaSessionManager) getSystemService(MEDIA_SESSION_SERVICE);
            return msm.getActiveSessions(new android.content.ComponentName(VentoApp.this, VentoEscucha.class));
        }

        /**
         * Lo que suena ahora desde el celular: por cada reproductor (YouTube Music, YouTube, Spotify…) su canción, si
         * suena o está en pausa, si suena en OTRO aparato (TV, Chromecast…) y el nombre de ese aparato tal como lo
         * muestra la app en su aviso («YouTube on TV», «Sala familiar»…). JSON: {permiso, lista:[…]}.
         */
        @JavascriptInterface
        public String medios() {
            JSONObject o = new JSONObject();
            try {
                boolean ok = escuchaPermitida();
                o.put("permiso", ok);
                JSONArray l = new JSONArray();
                if (ok) {
                    android.service.notification.StatusBarNotification[] avisos = null;
                    try { VentoEscucha e = VentoEscucha.activa; if (e != null) avisos = e.getActiveNotifications(); } catch (Exception ignorado) { }
                    for (android.media.session.MediaController c : controles()) {
                        String pkg = c.getPackageName();
                        if (getPackageName().equals(pkg)) continue;
                        JSONObject m = new JSONObject();
                        m.put("app", pkg);
                        try { m.put("nombreApp", String.valueOf(getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(pkg, 0)))); } catch (Exception ignorado) { m.put("nombreApp", pkg); }
                        android.media.MediaMetadata md = c.getMetadata();
                        if (md != null) {
                            m.put("titulo", String.valueOf(md.getString(android.media.MediaMetadata.METADATA_KEY_TITLE)));
                            String ar = md.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST);
                            if (ar == null) ar = md.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                            m.put("artista", ar == null ? "" : ar);
                            m.put("dur", md.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION));
                        }
                        android.media.session.PlaybackState ps = c.getPlaybackState();
                        if (ps != null) { m.put("estado", ps.getState()); m.put("pos", ps.getPosition()); m.put("vel", ps.getPlaybackSpeed()); m.put("act", ps.getLastPositionUpdateTime()); }
                        android.media.session.MediaController.PlaybackInfo pi = c.getPlaybackInfo();
                        m.put("remoto", pi != null && pi.getPlaybackType() == android.media.session.MediaController.PlaybackInfo.PLAYBACK_TYPE_REMOTE);
                        // Nombre del aparato: lo que la app pone en su aviso («Reproduciendo en …» o el texto pequeño).
                        if (avisos != null) for (android.service.notification.StatusBarNotification sb : avisos) {
                            if (!pkg.equals(sb.getPackageName())) continue;
                            android.os.Bundle ex = sb.getNotification().extras;
                            if (ex == null || ex.get(android.app.Notification.EXTRA_MEDIA_SESSION) == null) continue;
                            CharSequence sub = ex.getCharSequence(android.app.Notification.EXTRA_SUB_TEXT);
                            if (sub != null && sub.length() > 0) m.put("donde", sub.toString());
                            break;
                        }
                        l.put(m);
                    }
                }
                o.put("lista", l);
            } catch (Exception e) {
                try { o.put("error", String.valueOf(e.getMessage())); } catch (Exception ignorado) { }
            }
            return o.toString();
        }

        /** Pausar / seguir / siguiente / anterior en el reproductor de esa app (lo que suena en el TV también). */
        @JavascriptInterface
        public boolean medioAccion(String pkg, String accion) {
            try {
                for (android.media.session.MediaController c : controles()) {
                    if (!c.getPackageName().equals(pkg)) continue;
                    android.media.session.MediaController.TransportControls t = c.getTransportControls();
                    if ("play".equals(accion)) t.play(); else if ("pause".equals(accion)) t.pause();
                    else if ("next".equals(accion)) t.skipToNext(); else if ("prev".equals(accion)) t.skipToPrevious();
                    return true;
                }
            } catch (Exception ignorado) { }
            return false;
        }

        /** Abre el permiso de «inicio automático» de cada marca (Xiaomi, Huawei, Oppo, Vivo…) para que Android no cierre Vento. */
        @JavascriptInterface
        public void ajustesInicio() {
            ui.post(() -> {
                String[][] c = {
                        {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
                        {"com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"},
                        {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                        {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
                        {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
                        {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
                        {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
                        {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
                        {"com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"},
                        {"com.asus.mobilemanager", "com.asus.mobilemanager.MainActivity"}};
                Context x = ventana != null ? ventana : VentoApp.this;
                for (String[] k : c) {
                    try {
                        Intent i = new Intent().setComponent(new android.content.ComponentName(k[0], k[1]));
                        if (ventana == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        if (getPackageManager().resolveActivity(i, 0) != null) { x.startActivity(i); return; }
                    } catch (Exception ignorado) { }
                }
                try {
                    Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                    if (ventana == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    x.startActivity(i);
                } catch (Exception ignorado) { }
            });
        }

        @JavascriptInterface
        public void vozIniciar(final String idioma, final boolean parcial, final boolean continuo) {
            ui.post(() -> {
                vozIdioma = (idioma == null || idioma.isEmpty()) ? "es-CO" : idioma;
                vozParcial = parcial;
                if (!tiene(Manifest.permission.RECORD_AUDIO)) {
                    if (ventana != null && Build.VERSION.SDK_INT >= 23) { vozPendiente = true; ventana.pedirPermisoVoz(); }
                    else vozNegada();
                    return;
                }
                iniciarVoz();
            });
        }

        @JavascriptInterface
        public void vozPreparar() { ui.post(() -> prepararVoz()); }

        @JavascriptInterface
        public void vozParar() { ui.post(() -> { try { if (voz != null) voz.stopListening(); } catch (Exception ignorado) { } }); }

        @JavascriptInterface
        public void vozCancelar() {
            ui.post(() -> {
                try { if (voz != null) voz.cancel(); } catch (Exception ignorado) { }
                js("window.__ventoVoz&&window.__ventoVoz('end',{})");
            });
        }

        /** Voz de Laya (lee en voz alta). Al terminar: window.__ventoHabla('end'). */
        @JavascriptInterface
        public void hablar(final String texto, final String idioma, final float velocidad) {
            ui.post(() -> {
                Runnable decir = () -> {
                    try {
                        tts.setLanguage(Locale.forLanguageTag(idioma == null || idioma.isEmpty() ? "es-CO" : idioma));
                        tts.setSpeechRate(velocidad > 0 ? velocidad : 1f);
                        tts.speak(texto, TextToSpeech.QUEUE_ADD, null, "v" + System.nanoTime());
                    } catch (Exception e) { js("window.__ventoHabla&&window.__ventoHabla('end')"); }
                };
                if (tts != null && ttsListo) { decir.run(); return; }
                tts = new TextToSpeech(VentoApp.this, st -> {
                    ttsListo = st == TextToSpeech.SUCCESS;
                    if (!ttsListo) { js("window.__ventoHabla&&window.__ventoHabla('end')"); return; }
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String u) { js("window.__ventoHabla&&window.__ventoHabla('start')"); }
                        @Override public void onDone(String u) { js("window.__ventoHabla&&window.__ventoHabla('end')"); }
                        @Override public void onError(String u) { js("window.__ventoHabla&&window.__ventoHabla('end')"); }
                    });
                    decir.run();
                });
            });
        }

        @JavascriptInterface
        public void callar() { ui.post(() -> { try { if (tts != null) tts.stop(); } catch (Exception ignorado) { } }); }

        /** Guarda un archivo (respaldo, reporte, foto) en Descargas. */
        @JavascriptInterface
        public void guardarArchivo(final String nombre, final String tipo, final String base64) {
            new Thread(() -> {
                String n = (nombre == null || nombre.isEmpty()) ? ("vento-" + System.currentTimeMillis()) : nombre.replaceAll("[\\\\/:*?\"<>|]", "-");
                try {
                    byte[] datos = Base64.decode(base64, Base64.DEFAULT);
                    if (Build.VERSION.SDK_INT >= 29) {
                        ContentValues cv = new ContentValues();
                        cv.put(MediaStore.Downloads.DISPLAY_NAME, n);
                        cv.put(MediaStore.Downloads.MIME_TYPE, tipo == null || tipo.isEmpty() ? "application/octet-stream" : tipo);
                        cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Vento");
                        Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (u == null) throw new Exception("sin espacio");
                        try (OutputStream o = getContentResolver().openOutputStream(u)) { if (o == null) throw new Exception("no abre"); o.write(datos); }
                    } else {
                        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                        try (FileOutputStream o = new FileOutputStream(new File(dir, n))) { o.write(datos); }
                    }
                    aviso("✅ Guardado en Descargas/Vento: " + n);
                } catch (Exception e) {
                    aviso("No pude guardar el archivo.");
                }
            }).start();
        }

        /** Trabajar de fondo (pedidos y música con la app cerrada): estado y prender/apagar. */
        @JavascriptInterface
        public boolean fondo() { return VentoServicio.activo; }

        @JavascriptInterface
        public void fondoActivar(final boolean si) {
            ui.post(() -> {
                getSharedPreferences("vento", MODE_PRIVATE).edit().putBoolean("fondo", si).apply();
                if (si) VentoServicio.arrancar(VentoApp.this);
                else VentoServicio.detener(VentoApp.this);
            });
        }

        /** Permisos del celular: estado ({microfono, camara, avisos, bateria, fondo}) y pedirlos otra vez. */
        @JavascriptInterface
        public String permisos() {
            try {
                JSONObject o = new JSONObject();
                o.put("microfono", tiene(Manifest.permission.RECORD_AUDIO));
                o.put("camara", tiene(Manifest.permission.CAMERA));
                o.put("avisos", Build.VERSION.SDK_INT < 33 || tiene(Manifest.permission.POST_NOTIFICATIONS));
                boolean bat = true;
                if (Build.VERSION.SDK_INT >= 23) {
                    android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
                    bat = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
                }
                o.put("bateria", bat);
                o.put("fondo", VentoServicio.activo);
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public void pedirPermisos() {
            ui.post(() -> {
                if (ventana == null) return;
                if (!ventana.pedirPermisosInicio(true)) ventana.pedirSinAhorroBateria(true);
            });
        }

        /** «Hola Vento»: mientras escucha sola, se silencia el pitido que hace Android cada vez que abre el micrófono. */
        @JavascriptInterface
        public void vozSilencio(final boolean si) {
            ui.post(() -> {
                try {
                    android.media.AudioManager am = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
                    if (am == null || Build.VERSION.SDK_INT < 23) return;
                    if (si == vozMuda) return;
                    vozMuda = si;
                    int d = si ? android.media.AudioManager.ADJUST_MUTE : android.media.AudioManager.ADJUST_UNMUTE;
                    am.adjustStreamVolume(android.media.AudioManager.STREAM_NOTIFICATION, d, 0);
                    am.adjustStreamVolume(android.media.AudioManager.STREAM_SYSTEM, d, 0);
                } catch (Exception ignorado) { }
            });
        }

        /** Ajustes del celular para que Android no duerma a Vento (ahorro de batería). */
        @JavascriptInterface
        public void ajustesBateria() { ui.post(() -> { if (ventana != null) ventana.pedirSinAhorroBateria(true); }); }
    }
}
