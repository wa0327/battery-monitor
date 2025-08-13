import Gio from "gi://Gio";
import St from "gi://St";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import { panel } from "resource:///org/gnome/shell/ui/main.js";
import { Button } from "resource:///org/gnome/shell/ui/panelMenu.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const BAT_PATH = "/sys/class/power_supply/BAT1";

function readFile(path) {
    try {
        let file = Gio.File.new_for_path(path);
        let [, contents] = file.load_contents(null);
        return imports.byteArray.toString(contents).trim();
    } catch (e) {
        return "";
    }
}

function readLong(path) {
    let val = parseInt(readFile(path));
    return isNaN(val) ? 0 : val;
}

const PowerIndicator = GObject.registerClass(
    class PowerIndicator extends Button {
        _init() {
            super._init(0.0, _("PowerIndicator"));

            this._label = new St.Label({
                text: "--",
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._label);

            this._timeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                5,
                () => {
                    this._update();
                    return GLib.SOURCE_CONTINUE;
                }
            );

            this._update();
        }

        _update() {
            let current_uA = readLong(`${BAT_PATH}/current_now`);
            let voltage_uV = readLong(`${BAT_PATH}/voltage_now`);
            let charge_now_uAh = readLong(`${BAT_PATH}/charge_now`);
            let charge_full_uAh = readLong(`${BAT_PATH}/charge_full`);
            let status = readFile(`${BAT_PATH}/status`);

            let power_W = (current_uA * voltage_uV) / 1e12; // µA × µV → W
            let hours = 0;
            let time_str = "";

            if (status == "Discharging") {
                power_W = -power_W;
                hours = charge_now_uAh / current_uA;
            } else if (status == "Charging") {
                let remain_uAh = charge_full_uAh - charge_now_uAh;
                hours = remain_uAh / current_uA;
            }

            if (hours > 0) {
                let h = Math.floor(hours);
                let m = Math.floor((hours - h) * 60);
                time_str = `${h}:${m.toString().padStart(2, "0")}`;
            }

            if (time_str) {
                this._label.text = `${power_W.toFixed(2)} | ${time_str}`;
            } else {
                this._label.text = `${power_W.toFixed(2)}`;
            }
        }

        destroy() {
            if (this._timeoutId) {
                GLib.source_remove(this._timeoutId);
                this._timeoutId = 0;
            }
            super.destroy();
        }
    }
);

export default class PowerExtension extends Extension {
    enable() {
        this.indicator = new PowerIndicator();
        panel.addToStatusArea(this.uuid, this.indicator);
    }

    disable() {
        this.indicator.destroy();
        delete this.indicator;
    }
}
