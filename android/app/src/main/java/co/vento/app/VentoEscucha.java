package co.vento.app;

import android.service.notification.NotificationListenerService;

/**
 * Permiso «Acceso a notificaciones» (lo da el dueño en Ajustes del celular). Con él Vento puede ver la música que
 * ya está sonando desde el celular (YouTube Music, YouTube, Spotify…) y en qué aparato suena («YouTube on TV»,
 * un Chromecast…), y pausarla o pasar a la siguiente. Vento no lee ni guarda los mensajes de otras apps: solo
 * mira los reproductores de música.
 */
public class VentoEscucha extends NotificationListenerService {
    static volatile VentoEscucha activa;

    @Override public void onListenerConnected() { activa = this; }
    @Override public void onListenerDisconnected() { if (activa == this) activa = null; }
    @Override public void onDestroy() { if (activa == this) activa = null; super.onDestroy(); }
}
