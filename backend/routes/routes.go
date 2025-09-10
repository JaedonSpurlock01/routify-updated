package routes

import (
	"github.com/jaedonspurlock01/routify-updated/internal/handlers"
	"github.com/labstack/echo/v4"
)

func InitRoutes(e *echo.Echo, h *handlers.Handler) {
	e.GET("/osm/:osm_id/:osm_type", h.GetOSMCDNUrl)
}
