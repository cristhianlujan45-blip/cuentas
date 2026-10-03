package co.vento.app;

import android.content.Context;
import android.os.Bundle;

import androidx.mediarouter.media.MediaRouteSelector;
import androidx.mediarouter.media.MediaRouter;

import com.google.android.gms.cast.CastDevice;
import com.google.android.gms.cast.CastMediaControlIntent;

import org.json.JSONObject;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.HashSet;
import java.util.Set;

/**
 * Busca los aparatos con Chromecast integrado (Chromecast, Google TV, Android TV, TV con Chromecast,
 * parlantes y pantallas Nest…) con el MISMO buscador que usa la app de YouTube: el de Google Play
 * Services (MediaRouter + Cast). Así en Vento salen los mismos aparatos que en «Elige un dispositivo»
 * de YouTube, con su nombre («Sala familiar») y lo que están mostrando («YouTube»).
 * Si el celular no tiene Google Play Services, no hace nada (siguen las otras búsquedas).
 */
final class BuscadorCast {

    private BuscadorCast() { }

    private static final String APP_YOUTUBE = "233637DE";

    /** Busca durante {@code ms} milisegundos. Devuelve con qué se detiene (se puede llamar desde cualquier hilo). */
    static Runnable buscar(final Context ctx, final long ms) {
        if (ctx == null) return () -> { };
        final Object[] estado = new Object[2];                 // {MediaRouter, Callback}
        final Set<String> hechos = new HashSet<>();
        final Runnable parar = () -> VentoApp.ui.post(() -> {
            try { if (estado[0] != null && estado[1] != null) ((MediaRouter) estado[0]).removeCallback((MediaRouter.Callback) estado[1]); } catch (Throwable ignorado) { }
            estado[0] = null; estado[1] = null;
        });
        VentoApp.ui.post(() -> {
            try {
                final MediaRouteSelector sel = new MediaRouteSelector.Builder()
                        .addControlCategory(CastMediaControlIntent.categoryForCast(APP_YOUTUBE))
                        .build();
                final MediaRouter mr = MediaRouter.getInstance(ctx.getApplicationContext());
                final MediaRouter.Callback cb = new MediaRouter.Callback() {
                    @Override public void onRouteAdded(MediaRouter r, MediaRouter.RouteInfo ruta) { ver(ruta, sel, hechos); }
                    @Override public void onRouteChanged(MediaRouter r, MediaRouter.RouteInfo ruta) { ver(ruta, sel, hechos); }
                };
                mr.addCallback(sel, cb, MediaRouter.CALLBACK_FLAG_PERFORM_ACTIVE_SCAN | MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY);
                estado[0] = mr; estado[1] = cb;
                BuscadorTV.anotar("castGoogle", "buscando");
                for (MediaRouter.RouteInfo ruta : mr.getRoutes()) ver(ruta, sel, hechos);   // los que ya conocía
                VentoApp.ui.postDelayed(parar, ms);
            } catch (Throwable sinPlayServices) {
                BuscadorTV.anotar("castGoogle", "no disponible: " + sinPlayServices.getClass().getSimpleName());
                // celular sin Google Play Services o sin la librería: siguen las demás búsquedas
            }
        });
        return parar;
    }

    private static void ver(MediaRouter.RouteInfo ruta, MediaRouteSelector sel, Set<String> hechos) {
        try {
            if (ruta == null || ruta.isDefault() || !ruta.matchesSelector(sel)) return;
            BuscadorTV.agregar("castRutas", String.valueOf(ruta.getName()));
            Bundle extras = ruta.getExtras();
            final CastDevice d = extras == null ? null : CastDevice.getFromBundle(extras);
            if (d == null) return;
            InetAddress a = d.getInetAddress();
            if (!(a instanceof Inet4Address)) { BuscadorTV.agregar("castSinIp", String.valueOf(ruta.getName())); return; }
            final String ip = a.getHostAddress();
            final String que = ruta.getDescription() == null ? "" : ruta.getDescription().toString();
            if (!hechos.add(ip + "|" + que)) return;
            final String nombre = d.getFriendlyName() != null ? d.getFriendlyName() : String.valueOf(ruta.getName());
            final String modelo = d.getModelName() == null ? "" : d.getModelName();
            new Thread(() -> {
                try {
                    JSONObject tv = BuscadorTV.describirCastIp(ip, nombre, modelo, que);
                    if (tv != null) { tv.put("id", "cast:" + d.getDeviceId()); BuscadorTV.emitirExterno(tv); }
                } catch (Exception ignorado) { }
            }).start();
        } catch (Throwable ignorado) { }
    }
}
