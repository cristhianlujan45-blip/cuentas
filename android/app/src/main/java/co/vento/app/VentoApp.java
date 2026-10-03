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
    static MainActivity ventana;                // la ventana abierta (null si está cerrada)
    static final Handler ui = new Handler(Looper.getMainLooper());

    private SpeechRecognizer voz;
    private String vozIdioma = "es-CO";
    private boolean vozParcial = true;
    boolean vozPendiente = false;
    private TextToSpeech tts;
    private boolean ttsListo = false;

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
    void iniciarVoz() {
        vozPendiente = false;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            js("window.__ventoVoz&&window.__ventoVoz('error',{error:'service-not-allowed'});window.__ventoVoz&&window.__ventoVoz('end',{})");
            return;
        }
        try { if (voz != null) voz.destroy(); } catch (Exception ignorado) { }
        voz = SpeechRecognizer.createSpeechRecognizer(this);
        voz.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(android.os.Bundle b) { js("window.__ventoVoz&&window.__ventoVoz('start',{})"); }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float v) { }
            @Override public void onBufferReceived(byte[] b) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int t, android.os.Bundle b) { }

            @Override
            public void onError(int error) {
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
                js("window.__ventoVoz&&window.__ventoVoz('error',{error:" + q(e) + "});window.__ventoVoz&&window.__ventoVoz('end',{})");
            }

            @Override public void onPartialResults(android.os.Bundle b) { mandarResultados(b, false); }

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
        try { voz.startListening(i); }
        catch (Exception e) { js("window.__ventoVoz&&window.__ventoVoz('error',{error:'aborted'});window.__ventoVoz&&window.__ventoVoz('end',{})"); }
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

        /** Ajustes del celular para que Android no duerma a Vento (ahorro de batería). */
        @JavascriptInterface
        public void ajustesBateria() { ui.post(() -> { if (ventana != null) ventana.pedirSinAhorroBateria(true); }); }
    }
}
