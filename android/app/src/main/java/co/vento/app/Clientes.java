package co.vento.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Message;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.ArrayList;
import java.util.Locale;

/** Navegación y permisos de la página. Lo que necesita pantalla (cámara, permisos) usa la ventana abierta. */
final class Clientes {

    private Clientes() { }

    /** Lo que no es Vento (WhatsApp, YouTube, Google, enlaces intent://) se abre con su app. */
    static boolean abrirFuera(Uri u) {
        if (u == null) return false;
        String esquema = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if ((esquema.equals("https") || esquema.equals("http")) && VentoApp.HOST_VENTO.equalsIgnoreCase(u.getHost())
                && u.getPath() != null && u.getPath().startsWith("/cuentas")) return false;
        android.content.Context c = VentoApp.ventana != null ? VentoApp.ventana : VentoApp.app;
        try {
            Intent i;
            if (esquema.equals("intent")) {
                i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                if (VentoApp.ventana == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    c.startActivity(i);
                } catch (ActivityNotFoundException e) {
                    String respaldo = i.getStringExtra("browser_fallback_url");
                    if (respaldo != null) {
                        Intent r = new Intent(Intent.ACTION_VIEW, Uri.parse(respaldo));
                        if (VentoApp.ventana == null) r.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        c.startActivity(r);
                    }
                }
                return true;
            }
            i = new Intent(Intent.ACTION_VIEW, u);
            if (VentoApp.ventana == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception e) {
            VentoApp.aviso("No pude abrir ese enlace.");
        }
        return true;
    }

    static final class Navegacion extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            return abrirFuera(r.getUrl());
        }

        /** Android cerró la página por falta de memoria (pasa de fondo): sin esto la app entera se cerraba.
         *  Se descarta la página muerta y se crea otra; los datos están guardados, no se pierde nada. */
        @Override
        public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) {
            VentoApp.ui.post(() -> {
                try { if (v.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) v.getParent()).removeView(v); } catch (Exception ignorado) { }
                try { v.destroy(); } catch (Exception ignorado) { }
                if (VentoApp.web == v) VentoApp.web = null;
                MainActivity a = VentoApp.ventana;
                WebView nueva = VentoApp.motor(a);
                if (a != null) a.mostrar(nueva);
            });
            return true;
        }
    }

    static final class Cromo extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) {
            MainActivity a = VentoApp.ventana;
            if (a == null) { cb.onReceiveValue(null); return true; }
            return a.elegirArchivo(cb, p);
        }

        @Override
        public void onPermissionRequest(final PermissionRequest req) {
            VentoApp.ui.post(() -> {
                ArrayList<String> faltan = new ArrayList<>();
                for (String r : req.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && !VentoApp.tiene(Manifest.permission.CAMERA)) faltan.add(Manifest.permission.CAMERA);
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !VentoApp.tiene(Manifest.permission.RECORD_AUDIO)) faltan.add(Manifest.permission.RECORD_AUDIO);
                }
                if (faltan.isEmpty() || Build.VERSION.SDK_INT < 23) { req.grant(req.getResources()); return; }
                MainActivity a = VentoApp.ventana;
                if (a == null) { req.deny(); return; }
                a.pedirPermisosWeb(req, faltan);
            });
        }

        // window.open(...) → se abre afuera con su app (WhatsApp, YouTube, etc.)
        @Override
        public boolean onCreateWindow(WebView v, boolean dialogo, boolean gesto, Message msg) {
            WebView temp = new WebView(v.getContext());
            temp.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView vv, WebResourceRequest r) {
                    Uri u = r.getUrl();
                    if (!abrirFuera(u)) VentoApp.web.loadUrl(u.toString());
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
}
