package co.vento.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Al prender el celular (o actualizar la app), Vento vuelve a trabajar de fondo sola, sin abrirla. */
public class Arranque extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(a)) return;
        if (!c.getSharedPreferences("vento", Context.MODE_PRIVATE).getBoolean("fondo", true)) return;
        VentoServicio.arrancar(c);
    }
}
