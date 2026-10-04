package co.vento.admin;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Vento Admin: la app del proveedor. Abre el panel de administración (admin.html), que sigue pidiendo el
 * código personal para entrar. Lo que no es el panel (WhatsApp, GitHub, la APK) se abre con su propia app.
 */
public class AdminActivity extends Activity {

    static final String URL_ADMIN = "https://cristhianlujan45-blip.github.io/cuentas/admin.html";
    static final String HOST = "cristhianlujan45-blip.github.io";
    private static final int RC_ARCHIVO = 31;

    private WebView web;
    private ValueCallback<Uri[]> archivoCb;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0B0A12);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " VentoAdmin/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Puente(), "VentoAdmin");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return abrirFuera(r.getUrl()); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (archivoCb != null) archivoCb.onReceiveValue(null);
                archivoCb = cb;
                Intent i;
                try { i = p.createIntent(); } catch (Exception e) { i = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*"); }
                i.addCategory(Intent.CATEGORY_OPENABLE);
                try { startActivityForResult(Intent.createChooser(i, "Elegir archivo"), RC_ARCHIVO); }
                catch (Exception e) { archivoCb.onReceiveValue(null); archivoCb = null; }
                return true;
            }

            // window.open(...) → afuera con su app (WhatsApp, GitHub…)
            @Override
            public boolean onCreateWindow(WebView v, boolean dialogo, boolean gesto, Message msg) {
                WebView temp = new WebView(v.getContext());
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
        });
        setContentView(web);
        if (estado != null) web.restoreState(estado);
        else web.loadUrl(URL_ADMIN);
    }

    @Override
    protected void onSaveInstanceState(Bundle b) {
        super.onSaveInstanceState(b);
        web.saveState(b);
    }

    /** Solo el panel (…/cuentas/admin.html) se queda adentro; lo demás se abre con su app. */
    private boolean abrirFuera(Uri u) {
        if (u == null) return false;
        String esq = u.getScheme() == null ? "" : u.getScheme();
        if (("https".equals(esq) || "http".equals(esq)) && HOST.equalsIgnoreCase(u.getHost())
                && u.getPath() != null && u.getPath().startsWith("/cuentas/admin")) return false;
        try {
            Intent i = "intent".equals(esq) ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.setComponent(null);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No hay una app para abrir ese enlace.", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "No pude abrir ese enlace.", Toast.LENGTH_LONG).show();
        }
        return true;
    }

    @Override
    protected void onActivityResult(int rc, int resultado, Intent datos) {
        super.onActivityResult(rc, resultado, datos);
        if (rc != RC_ARCHIVO || archivoCb == null) return;
        Uri[] res = null;
        if (resultado == RESULT_OK && datos != null && datos.getData() != null) res = new Uri[]{datos.getData()};
        archivoCb.onReceiveValue(res);
        archivoCb = null;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    /** window.VentoAdmin: guardar respaldos y CSV en Descargas/Vento (el navegador de la app no descarga «blob:»). */
    class Puente {
        @JavascriptInterface
        public void guardar(final String nombre, final String tipo, final String texto) {
            new Thread(() -> {
                String n = (nombre == null || nombre.isEmpty()) ? ("vento-admin-" + System.currentTimeMillis()) : nombre.replaceAll("[\\\\/:*?\"<>|]", "-");
                byte[] datos = (texto == null ? "" : texto).getBytes(StandardCharsets.UTF_8);
                try {
                    if (Build.VERSION.SDK_INT >= 29) {
                        ContentValues cv = new ContentValues();
                        cv.put(MediaStore.Downloads.DISPLAY_NAME, n);
                        cv.put(MediaStore.Downloads.MIME_TYPE, tipo == null || tipo.isEmpty() ? "application/octet-stream" : tipo);
                        cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Vento");
                        Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (u == null) throw new Exception("sin destino");
                        try (OutputStream o = getContentResolver().openOutputStream(u)) { o.write(datos); }
                    } else {
                        File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Vento");
                        if (!dir.exists()) dir.mkdirs();
                        try (FileOutputStream o = new FileOutputStream(new File(dir, n))) { o.write(datos); }
                    }
                    runOnUiThread(() -> Toast.makeText(AdminActivity.this, "Guardado en Descargas/Vento: " + n, Toast.LENGTH_LONG).show());
                } catch (Exception e) {
                    runOnUiThread(() -> Toast.makeText(AdminActivity.this, "No pude guardar el archivo.", Toast.LENGTH_LONG).show());
                }
            }).start();
        }
    }
}
