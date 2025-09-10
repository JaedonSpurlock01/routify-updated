package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/jaedonspurlock01/routify-updated/internal/services"
	"github.com/jaedonspurlock01/routify-updated/internal_config"
	"github.com/labstack/echo/v4"
)

type JobStatus struct {
	ID        int       `json:"osm_id"`
	Status    string    `json:"status"` // "processing", "success", "failure"
	Error     string    `json:"error,omitempty"`
	Url       string    `json:"url,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

var (
	jobCache = sync.Map{}
)

func (h *Handler) GetOSMCDNUrl(c echo.Context) error {
	osm_id, err := strconv.Atoi(c.Param("osm_id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, "Invalid osm_id")
	}

	osm_type := c.Param("osm_type")
	cfg := internal_config.LoadConfig()

	// Check if overpass is already in S3, return CDN url if it is
	if exists, err := services.CheckOverpassInS3(c.Request().Context(), int64(osm_id)); err != nil {
		return c.JSON(http.StatusInternalServerError, "Error checking overpass in S3")
	} else if exists {
		return c.JSON(http.StatusOK, JobStatus{
			ID:        osm_id,
			Status:    "success",
			Url:       fmt.Sprintf("https://%s/%d.ndjson", cfg.AWSCloudfrontDomain, osm_id),
			Timestamp: time.Now(),
		})
	}

	// Check if job is already in cache
	if val, ok := jobCache.Load(osm_id); ok {
		return c.JSON(http.StatusAccepted, val)
	}

	// Send overpass request and save to S3
	status := JobStatus{ID: osm_id, Status: "processing", Timestamp: time.Now()}
	jobCache.Store(osm_id, status)

	go ProcessCity(osm_id, osm_type)

	return c.JSON(http.StatusAccepted, status)
}

// Background job
func ProcessCity(osm_id int, osm_type string) {
	defer func() {
		if r := recover(); r != nil {
			jobCache.Store(osm_id, JobStatus{ID: osm_id, Status: "failure", Error: fmt.Sprint(r), Timestamp: time.Now()})
		}
	}()

	overpass_data, err := services.SendOverpassRequest(osm_id, osm_type)
	if err != nil {
		jobCache.Store(osm_id, JobStatus{ID: osm_id, Status: "failure", Error: err.Error(), Timestamp: time.Now()})
		return
	}

	parsed_overpass_data := services.ParseOverpassResponse(overpass_data)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	s3_url, err := services.SaveOverpassToS3(ctx, int64(osm_id), parsed_overpass_data)

	if err != nil {
		jobCache.Store(osm_id, JobStatus{ID: osm_id, Status: "failure", Error: err.Error(), Timestamp: time.Now()})
		return
	}

	jobCache.Store(osm_id, JobStatus{ID: osm_id, Status: "success", Url: s3_url, Timestamp: time.Now()})
}
