"""Lightweight summary entity for Home Assistant."""

from homeassistant.components.sensor import SensorEntity
from homeassistant.const import UnitOfPower
from homeassistant.helpers.entity import DeviceInfo
from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    engine = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([PhaseMapperMappedSensor(engine)] + [
        PhasePowerSensor(engine, phase, value)
        for phase in ("L1", "L2", "L3", "TOTAL")
        for value in ("grid", "battery", "solar", "cleaned")
    ])


class PhaseMapperMappedSensor(SensorEntity):
    """Number of included devices with a sufficiently supported phase."""

    _attr_has_entity_name = True
    _attr_name = "Mapped devices"
    _attr_icon = "mdi:transmission-tower"
    _attr_should_poll = False
    _attr_native_unit_of_measurement = "devices"

    def __init__(self, engine):
        self.engine = engine
        self._attr_unique_id = "ha_auto_device_phase_mapping_mapped_devices"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, "ha_auto_device_phase_mapping")},
            name="HA_auto_device_phase_mapping",
            manufacturer="Open-source community",
            model="Passive phase correlation",
        )

    @property
    def native_value(self):
        excluded = set(self.engine.settings["excluded"])
        mapped = {entity_id for entity_id, result in self.engine.results.items()
                  if entity_id not in excluded and result.get("phase") not in (None, "Unknown")}
        mapped.update(entity_id for entity_id in self.engine.settings["manual_assignments"]
                      if entity_id not in excluded)
        return len(mapped)

    @property
    def extra_state_attributes(self):
        excluded = set(self.engine.settings["excluded"])
        return {
            "detected": len(self.engine.candidates),
            "excluded": len(excluded),
            "learning": self.engine.settings["learning_enabled"],
            "configured": all(self.engine.settings["phase_sensors"].values()),
            "last_observation": self.engine.last_observation,
        }

    async def async_added_to_hass(self):
        self.async_on_remove(self.engine.register_summary(self.async_write_ha_state))


class PhasePowerSensor(SensorEntity):
    """Read-only power breakdown entity for native HA More-info dialogs."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_native_unit_of_measurement = UnitOfPower.WATT
    _attr_icon = "mdi:flash"

    def __init__(self, engine, phase, part):
        self.engine = engine
        self.phase = phase
        self.part = part
        self._attr_unique_id = f"ha_auto_device_phase_mapping_{phase.lower()}_{part}"
        self._attr_name = f"{phase} {part} power"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, "ha_auto_device_phase_mapping")},
            name="HA_auto_device_phase_mapping",
        )

    @property
    def native_value(self):
        readings = self.engine._display_breakdown
        if not readings or any(phase not in readings for phase in ("L1", "L2", "L3")):
            return None
        if self.phase == "TOTAL":
            return round(sum(readings[p][self.part] for p in ("L1", "L2", "L3")), 1)
        return round(readings[self.phase][self.part], 1)

    async def async_added_to_hass(self):
        self.async_on_remove(self.engine.register_summary(self.async_write_ha_state))
