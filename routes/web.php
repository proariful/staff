use App\Http\Controllers\TrackingController;

Route::post('/api/tracking', [TrackingController::class, 'store']);