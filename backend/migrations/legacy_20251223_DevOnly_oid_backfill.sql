UPDATE route_runs
SET assigned_user_oid = '<entra_oid_of_test_user>',
    created_by_oid = '<entra_oid_of_lead>'
WHERE id = 1;