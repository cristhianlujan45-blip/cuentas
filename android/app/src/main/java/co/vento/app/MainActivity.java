package co.vento.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import java.util.ArrayList;

/**
 * La ventana de Vento. Muestra el «motor» (VentoApp.web), que sigue vivo aunque esta ventana se
 * cierre: así los pedidos y la música siguen funcionando de fondo con el servicio (VentoServicio).
 */
public class MainActivity extends Activity {

    private static final int RC_ARCHIVO = 11;
    private static final int RC_PERM_VOZ = 21;
    private static final int RC_PERM_WEB = 22;
    private static final int RC_PERM_ARCHIVO = 23;
    private static final int RC_PERM_AVISOS = 24;

    private WebView web;
    private ValueCallback<Uri[]> archivoCb;
    private WebChromeClient.FileChooserParams archivoParams;
    private Uri camaraUri;
    private PermissionRequest permisoWeb;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        VentoApp.ventana = this;
        // Pantalla prendida mientras la ventana esté abierta (con la ventana cerrada sigue el servicio de fondo).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = VentoApp.motor(this);
        if (web.getParent() instanceof ViewGroup) ((ViewGroup) web.getParent()).removeView(web);
        setContentView(web);

        abrirEnlace(getIntent());

        // Trabajar de fondo: prendido por defecto (se puede apagar desde Vento).
        if (getSharedPreferences("vento", MODE_PRIVATE).getBoolean("fondo", true)) {
            pedirPermisoAvisos();
            VentoServicio.arrancar(this);
            pedirSinAhorroBateria(false);
        }
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        abrirEnlace(i);
    }

    /** «vento://abrir?…#…» → abre esa misma dirección dentro de Vento (con sus datos, p. ej. el enlace del correo). */
    private void abrirEnlace(Intent i) {
        try {
            Uri u = i == null ? null : i.getData();
            if (u == null || !"vento".equals(u.getScheme())) return;
            String q = u.getEncodedQuery(), f = u.getEncodedFragment();
            String url = VentoApp.URL_VENTO + (q == null || q.isEmpty() ? "" : "?" + q) + (f == null || f.isEmpty() ? "" : "#" + f);
            if (web != null) web.loadUrl(url);
        } catch (Exception ignorado) { }
    }

    @Override
    protected void onResume() {
        super.onResume();
        VentoApp.ventana = this;
        VentoApp.alFrente = true;
        VentoApp.motor(this);
        try { web.onResume(); } catch (Exception ignorado) { }
        VentoApp.js("try{document.dispatchEvent(new Event('visibilitychange'))}catch(e){}");
    }

    @Override
    protected void onPause() {
        // OJO: no se llama web.onPause(): con eso la página dejaría de trabajar de fondo.
        VentoApp.alFrente = false;
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (VentoApp.ventana == this) VentoApp.ventana = null;
        // La página NO se destruye: se suelta de esta ventana y queda viva con el servicio de fondo.
        try {
            if (web != null && web.getParent() instanceof ViewGroup) ((ViewGroup) web.getParent()).removeView(web);
            VentoApp.envoltura.setBaseContext(getApplicationContext());
        } catch (Exception ignorado) { }
        if (!VentoServicio.activo) {
            // Sin servicio de fondo no tiene sentido mantenerla: se libera.
            try { VentoApp.web.destroy(); } catch (Exception ignorado) { }
            VentoApp.web = null;
        }
        super.onDestroy();
    }

    /** Atrás: primero cierra la ventana abierta en Vento; si no hay ninguna, vuelve; si no, a segundo plano. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(function(){try{return !!(window.ventoAtras&&window.ventoAtras());}catch(e){return false;}})()", r -> {
            if ("true".equals(r)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true);          // sigue trabajando de fondo
        });
    }

    // ---------------------------------------------------------------- Permisos de fondo
    private void pedirPermisoAvisos() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, RC_PERM_AVISOS);
        }
    }

    /** Pide que Android no «duerma» a Vento por ahorro de batería (una vez, o cuando se toca en Vento). */
    void pedirSinAhorroBateria(boolean siempre) {
        if (Build.VERSION.SDK_INT < 23) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            android.content.SharedPreferences p = getSharedPreferences("vento", MODE_PRIVATE);
            if (!siempre && p.getBoolean("bateriaPedida", false)) return;
            p.edit().putBoolean("bateriaPedida", true).apply();
            @SuppressLint("BatteryLife")
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception ignorado) { }
        }
    }

    void pedirPermisoVoz() {
        if (Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RC_PERM_VOZ);
    }

    void pedirPermisosWeb(PermissionRequest req, ArrayList<String> faltan) {
        permisoWeb = req;
        if (Build.VERSION.SDK_INT >= 23) requestPermissions(faltan.toArray(new String[0]), RC_PERM_WEB);
    }

    // ---------------------------------------------------------------- Cámara y galería
    boolean elegirArchivo(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams p) {
        if (archivoCb != null) archivoCb.onReceiveValue(null);
        archivoCb = cb;
        archivoParams = p;
        boolean quiereFoto = false;
        for (String t : p.getAcceptTypes()) if (t != null && t.startsWith("image")) quiereFoto = true;
        if (quiereFoto && p.isCaptureEnabled() && !VentoApp.tiene(Manifest.permission.CAMERA) && Build.VERSION.SDK_INT >= 23) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, RC_PERM_ARCHIVO);
            return true;
        }
        abrirSelector();
        return true;
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
        if (quiereFoto && VentoApp.tiene(Manifest.permission.CAMERA)) {
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
            if (ok && VentoApp.app.vozPendiente) VentoApp.app.iniciarVoz();
            else VentoApp.app.vozNegada();
        }
    }
}
