package co.vento.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Locale;

/**
 * Vento para Android: abre la misma Vento de siempre (https://cristhianlujan45-blip.github.io/cuentas/),
 * así se actualiza sola, y le suma lo que un navegador no deja hacer:
 *  - buscar los TV del wifi y abrir YouTube en ellos (BuscadorTV);
 *  - micrófono (dictado por voz) y voz de Laya, con los servicios de voz de Android;
 *  - cámara y galería para las facturas;
 *  - guardar archivos (respaldos, reportes) en Descargas.
 */
public class MainActivity extends Activity {

    static final String URL_VENTO = "https://cristhianlujan45-blip.github.io/cuentas/";
    static final String HOST_VENTO = "cristhianlujan45-blip.github.io";

    private static final int RC_ARCHIVO = 11;
    private static final int RC_PERM_VOZ = 21;
    private static final int RC_PERM_WEB = 22;
    private static final int RC_PERM_ARCHIVO = 23;

    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private ValueCallback<Uri[]> archivoCb;
    private WebChromeClient.FileChooserParams archivoParams;
    private Uri camaraUri;
    private PermissionRequest permisoWeb;

    private SpeechRecognizer voz;
    private String vozIdioma = "es-CO";
    private boolean vozParcial = true;
    private boolean vozPendiente = false;

    private TextToSpeech tts;
    private boolean ttsListo = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        // Pantalla siempre prendida mientras Vento esté abierta: así llegan los pedidos y suena la música.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0B0A12);
        setContentView(web);

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
        s.setUserAgentString(s.getUserAgentString() + " VentoAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Puente(), "VentoAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return abrirFuera(r.getUrl());
            }
        });
        web.setWebChromeClient(new Cromo());

        if (estado != null) web.restoreState(estado);
        else web.loadUrl(URL_VENTO);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        try { if (voz != null) voz.destroy(); } catch (Exception ignorado) { }
        try { if (tts != null) tts.shutdown(); } catch (Exception ignorado) { }
        super.onDestroy();
    }

    /** Atrás: primero cierra la ventana abierta en Vento; si no hay ninguna, vuelve; si no, sale. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(function(){try{return !!(window.ventoAtras&&window.ventoAtras());}catch(e){return false;}})()", r -> {
            if ("true".equals(r)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true);
        });
    }

    /** Lo que no es Vento (WhatsApp, YouTube, Google, enlaces intent://) se abre con su app. */
    private boolean abrirFuera(Uri u) {
        if (u == null) return false;
        String esquema = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if ((esquema.equals("https") || esquema.equals("http")) && HOST_VENTO.equalsIgnoreCase(u.getHost())
                && u.getPath() != null && u.getPath().startsWith("/cuentas")) return false;
        try {
            Intent i;
            if (esquema.equals("intent")) {
                i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    String respaldo = i.getStringExtra("browser_fallback_url");
                    if (respaldo != null) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(respaldo)));
                }
                return true;
            }
            i = new Intent(Intent.ACTION_VIEW, u);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "No pude abrir ese enlace.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void js(final String codigo) {
        ui.post(() -> { if (web != null) web.evaluateJavascript(codigo, null); });
    }

    private static String q(String s) {
        return JSONObject.quote(s == null ? "" : s);
    }

    private boolean tiene(String permiso) {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(permiso) == PackageManager.PERMISSION_GRANTED;
    }

    // ---------------------------------------------------------------- Cámara, galería y micrófono para la página
    private class Cromo extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (archivoCb != null) archivoCb.onReceiveValue(null);
            archivoCb = cb;
            archivoParams = p;
            boolean quiereFoto = false;
            for (String t : p.getAcceptTypes()) if (t != null && t.startsWith("image")) quiereFoto = true;
            if (quiereFoto && p.isCaptureEnabled() && !tiene(Manifest.permission.CAMERA) && Build.VERSION.SDK_INT >= 23) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, RC_PERM_ARCHIVO);
                return true;
            }
            abrirSelector();
            return true;
        }

        @Override
        public void onPermissionRequest(final PermissionRequest req) {
            ui.post(() -> {
                ArrayList<String> faltan = new ArrayList<>();
                for (String r : req.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && !tiene(Manifest.permission.CAMERA)) faltan.add(Manifest.permission.CAMERA);
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !tiene(Manifest.permission.RECORD_AUDIO)) faltan.add(Manifest.permission.RECORD_AUDIO);
                }
                if (faltan.isEmpty() || Build.VERSION.SDK_INT < 23) { req.grant(req.getResources()); return; }
                permisoWeb = req;
                requestPermissions(faltan.toArray(new String[0]), RC_PERM_WEB);
            });
        }

        // window.open(...) → se abre afuera con su app (WhatsApp, YouTube, etc.)
        @Override
        public boolean onCreateWindow(WebView v, boolean dialogo, boolean gesto, Message msg) {
            WebView temp = new WebView(MainActivity.this);
            temp.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView vv, WebResourceRequest r) {
                    Uri u = r.getUrl();
                    if (!abrirFuera(u)) web.loadUrl(u.toString());
                    vv.destroy();
                    return true;
                }
            });
            WebView.WebViewTransport t = (WebView.WebViewTransport) msg.obj;
            t.setWebView(temp);
            msg.sendToTarget();
            return true;
        }
    }

    private void abrirSelector() {
        WebChromeClient.FileChooserParams p = archivoParams;
        Intent galeria;
        try {
            galeria = p != null ? p.createIntent() : new Intent(Intent.ACTION_GET_CONTENT).setType("*/*");
        } catch (Exception e) {
            galeria = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*");
        }
        galeria.addCategory(Intent.CATEGORY_OPENABLE);
        if (p != null && p.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) galeria.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

        boolean quiereFoto = false;
        if (p != null) for (String t : p.getAcceptTypes()) if (t != null && (t.startsWith("image") || t.isEmpty())) quiereFoto = true;
        Intent camara = null;
        camaraUri = null;
        if (quiereFoto && tiene(Manifest.permission.CAMERA)) {
            try {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, "vento-" + System.currentTimeMillis() + ".jpg");
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                camaraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (camaraUri != null) {
                    camara = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    camara.putExtra(MediaStore.EXTRA_OUTPUT, camaraUri);
                    camara.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
            } catch (Exception e) {
                camara = null;
            }
        }
        Intent elegir;
        if (camara != null && p != null && p.isCaptureEnabled()) {
            elegir = camara;                                   // botón «Cámara» de Vento: directo a la cámara
        } else {
            elegir = Intent.createChooser(galeria, "Elegir archivo");
            if (camara != null) elegir.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camara});
        }
        try {
            startActivityForResult(elegir, RC_ARCHIVO);
        } catch (Exception e) {
            if (archivoCb != null) archivoCb.onReceiveValue(null);
            archivoCb = null;
        }
    }

    @Override
    protected void onActivityResult(int rc, int resultado, Intent datos) {
        super.onActivityResult(rc, resultado, datos);
        if (rc != RC_ARCHIVO || archivoCb == null) return;
        Uri[] res = null;
        if (resultado == RESULT_OK) {
            if (datos != null && datos.getClipData() != null) {
                int n = datos.getClipData().getItemCount();
                res = new Uri[n];
                for (int i = 0; i < n; i++) res[i] = datos.getClipData().getItemAt(i).getUri();
            } else if (datos != null && datos.getData() != null) {
                res = new Uri[]{datos.getData()};
            } else if (camaraUri != null) {
                res = new Uri[]{camaraUri};
            }
        } else if (camaraUri != null) {
            try { getContentResolver().delete(camaraUri, null, null); } catch (Exception ignorado) { }
        }
        archivoCb.onReceiveValue(res);
        archivoCb = null;
        camaraUri = null;
    }

    @Override
    public void onRequestPermissionsResult(int rc, String[] permisos, int[] resultados) {
        super.onRequestPermissionsResult(rc, permisos, resultados);
        boolean ok = resultados.length > 0;
        for (int r : resultados) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
        if (rc == RC_PERM_WEB && permisoWeb != null) {
            if (ok) permisoWeb.grant(permisoWeb.getResources()); else permisoWeb.deny();
            permisoWeb = null;
        } else if (rc == RC_PERM_ARCHIVO) {
            abrirSelector();
        } else if (rc == RC_PERM_VOZ) {
            if (ok && vozPendiente) iniciarVoz();
            else {
                vozPendiente = false;
                js("window.__ventoVoz&&window.__ventoVoz('error',{error:'not-allowed'});window.__ventoVoz&&window.__ventoVoz('end',{})");
            }
        }
    }

    // ---------------------------------------------------------------- Voz (dictado) con el reconocedor de Android
    private void iniciarVoz() {
        vozPendiente = false;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            js("window.__ventoVoz&&window.__ventoVoz('error',{error:'service-not-allowed'});window.__ventoVoz&&window.__ventoVoz('end',{})");
            return;
        }
        try { if (voz != null) voz.destroy(); } catch (Exception ignorado) { }
        voz = SpeechRecognizer.createSpeechRecognizer(this);
        voz.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle b) { js("window.__ventoVoz&&window.__ventoVoz('start',{})"); }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float v) { }
            @Override public void onBufferReceived(byte[] b) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int t, Bundle b) { }

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

            @Override public void onPartialResults(Bundle b) { mandarResultados(b, false); }

            @Override
            public void onResults(Bundle b) {
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

    private void mandarResultados(Bundle b, boolean esFinal) {
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
    private class Puente {

        @JavascriptInterface
        public String info() {
            try {
                JSONObject o = new JSONObject();
                o.put("version", BuildConfig.VERSION_NAME);
                o.put("codigo", BuildConfig.VERSION_CODE);
                o.put("android", Build.VERSION.SDK_INT);
                o.put("tv", true);
                o.put("puente", true);
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        /** Busca los TV del wifi. Cada uno llega a window.__ventoTV(tv); al final window.__ventoTVfin(n). */
        @JavascriptInterface
        public void buscarTVs() {
            new BuscadorTV(MainActivity.this).buscar(new BuscadorTV.Oyente() {
                @Override public void encontrado(JSONObject tv) { js("window.__ventoTV&&window.__ventoTV(" + tv + ")"); }
                @Override public void terminado(int n) { js("window.__ventoTVfin&&window.__ventoTVfin(" + n + ")"); }
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
         * así que ya no hace falta crear ni configurar el puente. Respuesta: window.__ventoCb(id, {status, text}).
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

        @JavascriptInterface
        public void vozIniciar(final String idioma, final boolean parcial, final boolean continuo) {
            ui.post(() -> {
                vozIdioma = (idioma == null || idioma.isEmpty()) ? "es-CO" : idioma;
                vozParcial = parcial;
                if (!tiene(Manifest.permission.RECORD_AUDIO) && Build.VERSION.SDK_INT >= 23) {
                    vozPendiente = true;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RC_PERM_VOZ);
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
                tts = new TextToSpeech(MainActivity.this, st -> {
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
                    ui.post(() -> Toast.makeText(MainActivity.this, "✅ Guardado en Descargas/Vento: " + n, Toast.LENGTH_LONG).show());
                } catch (Exception e) {
                    ui.post(() -> Toast.makeText(MainActivity.this, "No pude guardar el archivo.", Toast.LENGTH_LONG).show());
                }
            }).start();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean foco) {
        super.onWindowFocusChanged(foco);
        if (foco) web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
    }
}
