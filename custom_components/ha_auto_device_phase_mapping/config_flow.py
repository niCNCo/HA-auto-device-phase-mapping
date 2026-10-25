"""Home Assistant UI setup for HA_auto_device_phase_mapping."""

import voluptuous as vol
from homeassistant import config_entries
from .const import DOMAIN


class PhaseMapperConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """One local integration per Home Assistant installation."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Confirm setup, then configure P1 and exclusions in the dashboard."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="HA_auto_device_phase_mapping", data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
